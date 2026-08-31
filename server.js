// 1. IMPORT REQUIRED LIBRARIES updated 8/31/2026 9:28am
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
require('dotenv').config(); // This loads your .env file into process.env

const app = express();
const PORT = 3000;

// --- SECURE AI & API CONFIGURATION ---
// The server reads the secret keys directly from its own environment
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.MODAL_API_KEY || "";
const REVENUECAT_ANDROID_KEY = process.env.REVENUECAT_ANDROID_KEY || "";
const REVENUECAT_IOS_KEY = process.env.REVENUECAT_IOS_KEY || "";
const Fal_image_key = process.env.Fal_image_key || "";

const OPENROUTER_TEXT_URL = "https://openrouter.ai/api/v1/chat/completions";
const Fal_image_url = "https://fal.run/fal-ai/flux/schnell";

const LLAMA_MODEL = "meta-llama/llama-3.1-8b-instruct";

// Thematic Prompt Bindings for Portraits
const themeVisuals = {
    fire: { environment: "flickering heat-shimmer and rising sparks", color: "warm orange and deep crimson tones" },
    ice: { environment: "swirling freezing mist and delicate floating frost", color: "cool pale blues and sharp diamond lighting" },
    void: { environment: "faintly purple rifts and localized distortions of space", color: "deep violet hues and high-contrast shadow play" },
    shadow: { environment: "coiling whisps of smoke and midnight shadows", color: "monochromatic darkness pierced by singular sharp highlights" },
    clockwork: { environment: "floating microscopic golden cogs and steam puffs", color: "warm sepia tones and metallic reflections" },
    forests: { environment: "drifting glowing pollen and ethereal blooming forest flora", color: "vibrant organic greens and soft sun-dappled forest light" },
    mountains: { environment: "swirling alpine winds, scattered snow, and rugged stone peaks", color: "earthy grays, crisp whites, and stark high-altitude sunlight" },
    plains: { environment: "rolling golden grass, wildflowers, and gentle sweeping winds", color: "warm amber, soft greens, and wide-open daylight" },
    deserts: { environment: "drifting sand, ancient ruins, and shimmering heat waves", color: "sunbaked gold, ochre, and bright harsh sunlight" },
    swamps: { environment: "murky, slimy, and eerie with moonlight reflecting off the water", color: "deep shadows, moonlit water, and earthy tones" },
    city: { environment: "towering stone spires, glowing magical lanterns, and distant bustling streets", color: "warm lamplight, deep slate, and urban fantasy twilight" },
    ocean: { environment: "swirling deep-sea currents, coral reefs, and floating bioluminescent bubbles", color: "deep aquatic blues, aquamarine, and refracted underwater lighting" },
    storm: { environment: "crackling lightning, torrential rain, and dark churning clouds", color: "flashes of bright electric blue and heavy charcoal skies" },
    spirit: { environment: "floating ghostly forms, ethereal wisps, and spectral energy", color: "transparent, ghostly white, and flickering spectral light" },
    underground: { environment: "dark, damp, and eerie with flickering torchlight", color: "deep shadows, flickering torchlight, and earthy tones" },
    sewers: { environment: "slimey, slimy, and eerie with flickering torchlight", color: "deep shadows, flickering torchlight, and earthy tones" },
    tavern: { environment: "warm, inviting, and eerie with flickering torchlight", color: "warm amber, soft greens, and wide-open daylight" },
    inn: { environment: "cheerful, relaxing, and bustling with activity", color: "warm amber, soft browns, and warm lighting" },
    library: { environment: "shelves of ancient tomes, dusty cobwebs, and a musty scent", color: "dusty, musty, and ancient library light" },
    party: { environment: "bright, colorful, and festive with flashing lights and music", color: "vibrant colors, flashing lights, and warm lighting" },
    fey: { environment: "twinkling fairy lights, ethereal floating leaves, and soft ambient glow", color: "iridescent pastel tones, sparkling fairy dust, and soft moonlight" },
};

const HIGH_FANTASY_PROMPT_MODIFIER =
    'epic high fantasy digital art, grandiose and stylized heroic aesthetic, exaggerated silhouettes, ornate attire and equipment with glowing magical runes or ethereal accents, dramatic fantastical background with arcane phenomena, vibrant luminous color palette, dynamic volumetric lighting, masterwork concept art';

const ART_STYLES = {
    digital_painting: { id: 'digital_painting', label: 'Digital Painting', promptModifier: 'illustrated in a masterfully executed digital painting aesthetic' },
    photorealistic: { id: 'photorealistic', label: 'Photorealistic', promptModifier: 'hyper-realistic, photorealistic, 8k resolution, highly detailed photography' },
    anime_manga: { id: 'anime_manga', label: 'Anime/Manga', promptModifier: 'high quality anime style, studio ghibli, cel shaded, 2d illustration' },
    dark_fantasy: { id: 'dark_fantasy', label: 'Dark Fantasy', promptModifier: 'dark fantasy aesthetic, grimdark, gothic, brooding atmosphere, intense dramatic shadows' },
    high_fantasy: { id: 'high_fantasy', label: 'High Fantasy', promptModifier: HIGH_FANTASY_PROMPT_MODIFIER },
    freeform: { id: 'freeform', label: 'Freeform', promptModifier: 'highly detailed, breathtaking, cinematic concept art' },
};

const ART_STYLE_ALIASES = {
    'digital painting': 'digital_painting',
    digital_painting: 'digital_painting',
    photorealistic: 'photorealistic',
    'anime/manga': 'anime_manga',
    anime_manga: 'anime_manga',
    'dark fantasy': 'dark_fantasy',
    dark_fantasy: 'dark_fantasy',
    'high fantasy': 'high_fantasy',
    high_fantasy: 'high_fantasy',
    freeform: 'freeform',
};

const resolveArtStyle = (idOrLabel) => {
    const key = String(idOrLabel || '').trim().toLowerCase();
    const id = ART_STYLE_ALIASES[key] || 'digital_painting';
    return ART_STYLES[id];
};

// 2. CONFIGURE MEMORY AND SECURITY
// Configured to explicitly support your Ngrok tunnel export while allowing local testing
app.use(cors({
    origin: ['https://uniquely-disloyal-gosling.ngrok-free.dev', 'http://localhost:3000', 'http://localhost:8081'],
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Increased payload limit because Base64 images can be quite large!
app.use(express.json({ limit: '50mb' })); 

// 3. SET UP PHYSICAL STORAGE
const IMAGES_DIR = path.join(__dirname, 'images');
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR);
    console.log('[Vault] Created secure images directory.');
}
// Makes the images folder publicly accessible via URL
app.use('/images', express.static(IMAGES_DIR));

// 4. SET UP THE LEDGER (SQLite Database)
const db = new sqlite3.Database('./questlog.sqlite', (err) => {
    if (err) {
        console.error('[Ledger Error] Failed to open database:', err.message);
    } else {
        console.log('[Ledger] Connected to the SQLite database.');
        
        // Create Hero profiles table (Base schema)
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT,
            gold INTEGER DEFAULT 0,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1
        )`, () => {
            // Safely patch existing databases with new tracking columns
            db.run(`ALTER TABLE users ADD COLUMN gems INTEGER DEFAULT 100`, () => {});
            db.run(`ALTER TABLE users ADD COLUMN is_premium INTEGER DEFAULT 0`, () => {});
            db.run(`ALTER TABLE users ADD COLUMN avatar_url TEXT`, () => {});
            db.run(`ALTER TABLE users ADD COLUMN unlocked_slots INTEGER DEFAULT 6`, () => {}); // Missing sync stat
        });

        // Inventory table
        db.run(`CREATE TABLE IF NOT EXISTS inventory (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            name TEXT,
            description TEXT,
            image_url TEXT,
            power_level INTEGER,
            icon_type TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`, () => {
            // Safely patch existing inventory table with all exported store metadata
            db.run(`ALTER TABLE inventory ADD COLUMN visual_tags TEXT`, () => {});
            db.run(`ALTER TABLE inventory ADD COLUMN theme TEXT`, () => {});
            db.run(`ALTER TABLE inventory ADD COLUMN style TEXT`, () => {});
            db.run(`ALTER TABLE inventory ADD COLUMN gender TEXT`, () => {});
            db.run(`ALTER TABLE inventory ADD COLUMN race TEXT`, () => {});
            db.run(`ALTER TABLE inventory ADD COLUMN occupation TEXT`, () => {});
            db.run(`ALTER TABLE inventory ADD COLUMN item_category TEXT`, () => {});
        });
    }
});

// --- API ENDPOINTS (The Bridge to your Phone) ---

app.get('/api/ping', (req, res) => {
    res.json({ message: "The Oracle is listening.", status: "online" });
});

// GET: Serve App Config & Public Keys
app.get('/api/config/keys', (req, res) => {
    res.json({
        revenueCatAndroid: REVENUECAT_ANDROID_KEY,
        revenueCatIos: REVENUECAT_IOS_KEY
    });
});

// GET: Fetch User Data AND INVENTORY on Load
app.get('/api/user/:userId', (req, res) => {
    const userId = req.params.userId;
    db.get(`SELECT * FROM users WHERE id = ?`, [userId], (err, userRow) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!userRow) {
            // Automatically register new heroes with the unlocked slots default
            db.run(`INSERT INTO users (id, username, gold, gems, xp, level, is_premium, unlocked_slots) VALUES (?, 'Wandering Hero', 500, 100, 0, 1, 0, 6)`, [userId], (err) => {
                if (err && !err.message.includes("UNIQUE constraint")) {
                    console.error('[Ledger] Insert Error:', err.message);
                }
            });
            return res.json({ hero: { id: userId, username: 'Wandering Hero', gold: 500, gems: 100, xp: 0, level: 1, is_premium: 0, avatar_url: null, unlocked_slots: 6 }, inventory: [] });
        }

        db.all(`SELECT * FROM inventory WHERE user_id = ?`, [userId], (err, invRows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ hero: userRow, inventory: invRows });
        });
    });
});

// POST: Sync User Stats (Gold, Gems, XP, Level, Name, Subscription, Avatar, Slots)
app.post('/api/user/sync', (req, res) => {
    const { userId, gold, gems, username, xp, level, isSubscribed, avatarImage, unlocked_slots } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    let finalAvatarUrl = undefined;

    // Handle new Avatar uploads from the Scrying pool
    if (avatarImage && avatarImage.startsWith('data:image')) {
        try {
            const base64Data = avatarImage.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
            const filename = `avatar_${userId}_${Date.now()}.png`;
            const filepath = path.join(IMAGES_DIR, filename);
            fs.writeFileSync(filepath, base64Data, 'base64');
            finalAvatarUrl = `/images/${filename}`;
            console.log(`[Vault] Crystallized Hero Avatar to disk: ${filename}`);
        } catch (e) {
            console.error("[Vault] Error saving avatar image:", e);
        }
    } else if (avatarImage === null) {
        finalAvatarUrl = null;
    }

    db.get(`SELECT id FROM users WHERE id = ?`, [userId], (err, row) => {
        if (!row) {
            db.run(`INSERT INTO users (id, username, gold, gems, xp, level, is_premium, avatar_url, unlocked_slots) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                [userId, username || "Wandering Hero", gold ?? 500, gems ?? 100, xp ?? 0, level ?? 1, isSubscribed ? 1 : 0, finalAvatarUrl || null, unlocked_slots ?? 6],
                (err) => {
                    if (err && !err.message.includes("UNIQUE constraint")) {
                        console.error('[Ledger] Sync Insert Error:', err.message);
                    }
                });
        } else {
            let updates = [];
            let params = [];
            if (gold !== undefined) { updates.push("gold = ?"); params.push(gold); }
            if (gems !== undefined) { updates.push("gems = ?"); params.push(gems); }
            if (username !== undefined) { updates.push("username = ?"); params.push(username); }
            if (xp !== undefined) { updates.push("xp = ?"); params.push(xp); }
            if (level !== undefined) { updates.push("level = ?"); params.push(level); }
            if (isSubscribed !== undefined) { updates.push("is_premium = ?"); params.push(isSubscribed ? 1 : 0); }
            if (finalAvatarUrl !== undefined) { updates.push("avatar_url = ?"); params.push(finalAvatarUrl); }
            if (unlocked_slots !== undefined) { updates.push("unlocked_slots = ?"); params.push(unlocked_slots); }

            if (updates.length > 0) {
                params.push(userId);
                db.run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);
            }
        }
        res.json({ success: true, message: "Sync complete." });
    });
});

// POST: Add Item to Inventory (And save Image to disk!)
app.post('/api/inventory/add', (req, res) => {
    const { userId, item, gold } = req.body;
    if (!userId || !item) return res.status(400).json({ error: "Missing data" });

    let finalImageUrl = item.image_data;

    // If the app sends us a Base64 image, crystallize it to the laptop's hard drive!
    if (finalImageUrl && finalImageUrl.startsWith('data:image')) {
        try {
            const base64Data = finalImageUrl.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
            const filename = `item_${item.id}_${Date.now()}.png`;
            const filepath = path.join(IMAGES_DIR, filename);
            fs.writeFileSync(filepath, base64Data, 'base64');
            // Save the public URL path so the phone can render it seamlessly later
            finalImageUrl = `/images/${filename}`;
            console.log(`[Vault] Crystallized item image to disk: ${filename}`);
        } catch (e) {
            console.error("[Vault] Error saving image:", e);
        }
    }

    db.serialize(() => {
        if (gold !== undefined) {
            db.run(`UPDATE users SET gold = ? WHERE id = ?`, [gold, userId]);
        }
        
        db.run(`INSERT INTO inventory (id, user_id, name, description, image_url, power_level, icon_type, visual_tags, theme, style, gender, race, occupation, item_category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                item.id, 
                userId, 
                item.name, 
                item.desc, 
                finalImageUrl, 
                item.power_level, 
                item.icon_type || 'item',
                item.visual_tags || null,
                item.theme || null,
                item.style || null,
                item.gender || null,
                item.race || null,
                item.occupation || null,
                item.item_category || null
            ], 
            (err) => {
                if (err && !err.message.includes("UNIQUE constraint")) {
                    console.error("[Vault] Inventory Insert Error:", err.message);
                }
                res.json({ success: true, message: "Item added to vault." });
            }
        );
    });
});

// POST: Remove/Consume Item from Inventory
app.post('/api/inventory/remove', (req, res) => {
    const { userId, itemId } = req.body;
    if (!userId || !itemId) return res.status(400).json({ error: "Missing data" });

    db.run(`DELETE FROM inventory WHERE id = ? AND user_id = ?`, [itemId, userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Item consumed." });
    });
});

// POST: Delete User Profile & Inventory
app.post('/api/user/delete', (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    db.serialize(() => {
        db.run(`DELETE FROM inventory WHERE user_id = ?`, [userId], (err) => {
            if (err) console.error('[Ledger] Deletion Error (Inventory):', err.message);
        });
        db.run(`DELETE FROM users WHERE id = ?`, [userId], (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: "Hero files erased." });
        });
    });
});

// --- SECURE AI ENDPOINTS (Acting as the Proxy to OpenRouter) ---

// Generate Quest Text - UPGRADED TO STRUCTURAL JSON FOR BALANCED OUTPUTS
app.post('/api/ai/quest', async (req, res) => {
    if (!OPENROUTER_API_KEY) return res.status(500).json({ error: "Server missing API key." });
    const { task, location } = req.body;
    
    const systemPrompt = `You are a fantasy RPG quest generator. Translate the user's mundane task into an epic, high-fantasy quest.
Output exclusively valid JSON with these keys:
{
  "title": "[Epic, catchy quest name without brackets, e.g., Shadow over the Mire]",
  "description": "[A short, exciting 2-sentence description of the venture without brackets. Do not mention Lyra or Elara.]"
}`;

    try {
        const response = await fetch(OPENROUTER_TEXT_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`
            },
            body: JSON.stringify({ 
                model: LLAMA_MODEL,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Location: ${location}. Task: ${task}` }
                ]
            }),
        });
        if (!response.ok) throw new Error(`OpenRouter Rift: ${response.status}`);
        
        const data = await response.json();
        const rawOutput = data.choices?.[0]?.message?.content?.trim() || "{}";
        const parsedQuest = JSON.parse(rawOutput);

        const title = (parsedQuest.title || "An Unforeseen Venture").replace(/[\[\]]/g, "").trim();
        const description = (parsedQuest.description || "A mysterious force calls you into the unknown.").replace(/[\[\]]/g, "").trim();
        
        // Assemble cleanly back into the format your frontend expects
        const formattedResult = `${title} | ${description}`;
        res.json({ result: formattedResult });
    } catch (error) {
        console.error("[Oracle OpenRouter] Quest Error:", error);
        res.json({ result: "A Disturbance in the Realm | The Oracle's vision was obscured by dark magic. Proceed with extreme caution." });
    }
});

// Generate Shop Item (JSON)
// 1. Move static arrays OUTSIDE the route handler to save memory
const TYPES = ["item", "pet", "person"];
const THEMES = ["fire", "ice", "void", "shadow", "clockwork", "forests", "mountains", "plains", "deserts", "city", "ocean", "storm", "spirit", "underground", "sewers", "tavern", "inn", "library", "party", "fey"];
const ITEM_TYPES = ["weapon", "armor", "magic item"];
const MAGIC_TYPES = ["wand", "staff", "robe", "ring", "amulet", "talisman", "scroll", "book", "map", "artifact"];
const ARMOR_CATEGORIES = ["clothing", "leather armor", "armor"];
const ARMOR_CATEGORY_PROMPTS = {
    clothing: {
        label: "fantasy clothing",
        generationHint: "light wearable garb — robes, tunics, cloaks, dresses, sashes, hoods, or travel wear. No metal plates or heavy leather armor.",
        examples: "embroidered silk robe, merchant's travel cloak, festival tunic, hooded linen vestments",
        imageHint: "a single fantasy garment displayed flat or on a simple mannequin form, with visible fabric weave, embroidery, and drape",
    },
    "leather armor": {
        label: "leather armor",
        generationHint: "protective leather gear — jerkins, brigandine, studded leather, bracers, leather boots, or hooded leather armor. No full plate metal.",
        examples: "studded leather jerkin, ranger's reinforced vest, buckled leather bracers, shadow-stitched leather hood",
        imageHint: "a single leather armor piece centered in frame, showing stitching, buckles, worn grain, and layered leather panels",
    },
    armor: {
        label: "metal armor",
        generationHint: "heavy protective metal gear — plate mail, chainmail, breastplate, helm, pauldrons, or gauntlets.",
        examples: "ornate plate breastplate, chainmail hauberk, knight's great helm, engraved pauldrons",
        imageHint: "a single metal armor piece centered in frame, with visible rivets, engravings, chain links, or plate segments",
    },
};
const GENDERS = ["Male", "Female"];
// Cleaned up some spelling/capitalization (Yaun-ti -> Yuan-ti, Faire -> Fairy, etc.)
const RACES = ["Human", "Elf", "Dwarf", "Tiefling", "Tabaxi", "Orc", "Halfling", "Dragonborn", "Gnome", "Goblin", "Fairy", "Satyr", "Centaur", "Minotaur", "Drow", "Siren", "Yuan-ti"];
const OCCUPATIONS = ["Warrior", "Mage", "Priest", "Rogue", "Paladin", "Bard", "Ranger", "Druid", "Barbarian", "Monk", "Necromancer", "Sorcerer", "Warlock", "Wizard", "Witch", "Knight", "Brawler"];

// Helper function
const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

function buildItemGenerationPrompt({ itemLabel, theme, generationHint, examples, extraVisualGuidance = "" }) {
    return `You are an AI designing items for an RPG. Generate a unique fantasy ${itemLabel} associated with the ${theme} theme.

Requirements:
- The item must be: ${generationHint}
- Suitable examples: ${examples}
- Output ONLY valid JSON.
- JSON structure MUST match exactly:
{
  "name": "[Evocative item name]",
  "lore": "[Exactly 2 sentences describing history, craftsmanship, and how it feels to wear or wield. No Lyra or Elara.]",
  "visual_tags": "[A comma-separated list of 5-7 highly specific visual traits for an image generator — materials, textures, colors, fasteners, wear patterns, silhouette]${extraVisualGuidance ? ` ${extraVisualGuidance}` : ""}"
}`;
}

function buildArmorImagePrompt(itemName, visualDetails, envAddon, styleAddon, colorAddon, itemCategory) {
    const cat = (itemCategory || "armor").toLowerCase();
    const base = `single object, centered, solid dark background, highly detailed prop design, cinematic lighting, ${styleAddon}${colorAddon}`;

    if (cat === "clothing") {
        return `A majestic fantasy clothing icon of ${itemName}, ${envAddon}a wearable garment with ${visualDetails}, fabric textures and embroidery clearly visible, ${base}`;
    }
    if (cat.includes("leather")) {
        return `A majestic fantasy leather armor icon of ${itemName}, ${envAddon}protective leather piece featuring ${visualDetails}, visible stitching, buckles, and worn leather grain, ${base}`;
    }
    return `A majestic fantasy metal armor icon of ${itemName}, ${envAddon}protective metal piece featuring ${visualDetails}, visible rivets, engravings, or chain links, ${base}`;
}

app.post('/api/ai/shop-item', async (req, res) => {
    if (!OPENROUTER_API_KEY) return res.status(500).json({ error: "Server missing API key." });
    
    const { requestedStyle = "Digital Painting", requestedTheme = "Random", styleId } = req.body;
    const artStyle = resolveArtStyle(styleId || requestedStyle);

    const type = getRandom(TYPES);
    const theme = (requestedTheme && requestedTheme.toLowerCase() !== "random" && requestedTheme.toLowerCase() !== "none") 
        ? requestedTheme.toLowerCase() : getRandom(THEMES);

    let systemPrompt = "";
    let userPrompt = "";
    let gender = "", race = "", occupation = "";
    let item_category = type;
    let icon_type_resolved = type;
    
    // 2. Use a Switch statement to prevent logic overlap
    switch (type) {
        case "item": {
            const roll = getRandom(ITEM_TYPES);

            if (roll === "magic item") {
                item_category = getRandom(MAGIC_TYPES);
                icon_type_resolved = "magic";
                systemPrompt = buildItemGenerationPrompt({
                    itemLabel: item_category,
                    theme,
                    generationHint: `a magical ${item_category} imbued with arcane power`,
                    examples: `enchanted ${item_category}, rune-etched ${item_category}, relic ${item_category}`,
                    extraVisualGuidance: "Include glowing runes, arcane energy, or mystical materials where appropriate.",
                });
                userPrompt = `Generate a ${item_category} with ${theme} magical affinities.`;
            } else if (roll === "armor") {
                item_category = getRandom(ARMOR_CATEGORIES);
                icon_type_resolved = "armor";
                const armorProfile = ARMOR_CATEGORY_PROMPTS[item_category];
                systemPrompt = buildItemGenerationPrompt({
                    itemLabel: armorProfile.label,
                    theme,
                    generationHint: armorProfile.generationHint,
                    examples: armorProfile.examples,
                    extraVisualGuidance: `Emphasize details specific to ${armorProfile.label}, not other armor types.`,
                });
                userPrompt = `Generate ${armorProfile.label} with ${theme} thematic accents.`;
            } else {
                item_category = roll;
                icon_type_resolved = roll;
                systemPrompt = buildItemGenerationPrompt({
                    itemLabel: roll,
                    theme,
                    generationHint: `a functional fantasy ${roll} built for combat or adventure`,
                    examples: roll === "weapon"
                        ? "longsword, war axe, recurve bow, spiked mace, ornate dagger"
                        : `${roll}`,
                });
                userPrompt = `Generate a ${roll} with ${theme} affinities.`;
            }
            break;
        }

        case "person":
            gender = getRandom(GENDERS);
            race = getRandom(RACES);
            occupation = getRandom(OCCUPATIONS);
            item_category = occupation;

            systemPrompt = `You are an AI designing characters for an RPG. Generate an ally who is explicitly a ${gender} ${race} ${occupation} associated with the elements of ${theme}.
1. Output ONLY valid JSON.
2. JSON structure MUST match exactly:
{
  "name": "[Name or Title]",
  "lore": "[A 2-sentence description showcasing their personality and backstory. No Lyra or Elara.]",
  "visual_tags": "[A comma-separated list of 4-6 specific physical/visual traits for an image generator (e.g., glowing red eyes, jagged obsidian armor, fiery aura)]"
}`;
            userPrompt = `Generate a ${gender} ${race} ${occupation} with ${theme} affinities.`;
            break;

        case "pet":
        default:
            systemPrompt = `You are an AI designing assets for an RPG. Generate a unique fantasy ${type} associated with ${theme}.
1. Output ONLY valid JSON.
2. JSON structure MUST match exactly:
{
  "name": "[Name]",
  "lore": "[A 2-sentence description of the item's history/powers. No Lyra or Elara.]",
  "visual_tags": "[A comma-separated list of 4-6 specific visual traits for an image generator (e.g., glowing core, wrapped in chains)]"
}`;
            userPrompt = `Generate a ${type} aligned with the ${theme} theme.`;
            break;
    }

    try {
        const response = await fetch(OPENROUTER_TEXT_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`
            },
            body: JSON.stringify({ 
                model: LLAMA_MODEL,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ]
            }),
        });
        
        if (!response.ok) throw new Error(`OpenRouter Rift: ${response.status}`);
        const data = await response.json();
        
        let rawOutput = data.choices?.[0]?.message?.content?.trim() || "{}";
        
        // 3. Defensively strip markdown formatting if the LLM hallucinates it
        rawOutput = rawOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        const parsedItem = JSON.parse(rawOutput);
        
        res.json({
            item: {
                name: parsedItem.name || "Unknown Artifact",
                desc: parsedItem.lore || "A mysterious object from the void.", 
                visual_tags: parsedItem.visual_tags || theme, 
                cost: Math.floor(Math.random() * 400) + 50,
                icon_type: icon_type_resolved,
                power_level: Math.floor(Math.random() * 30) + 20,
                theme,
                style: artStyle.label,
                gender, race, occupation,
                item_category
            }
        });
    } catch (error) {
        console.error("[Oracle OpenRouter] Shop Error:", error);
        const fallbackIcon = type === "person" ? "person" : type === "pet" ? "pet" : "weapon";
        res.json({
            item: {
                name: `Enigmatic ${type.charAt(0).toUpperCase() + type.slice(1)} of ${theme.charAt(0).toUpperCase() + theme.slice(1)}`,
                desc: `The Oracle's vision was clouded by interference, but this ${type} materialized anyway. It radiates unstable ${theme} magic.`,
                visual_tags: `glowing ${theme} aura, mysterious, highly detailed, fantasy`,
                cost: Math.floor(Math.random() * 200) + 50,
                icon_type: fallbackIcon,
                power_level: Math.floor(Math.random() * 30) + 20,
                theme, style: artStyle.label,
                gender: gender || "Unknown", race: race || "Unknown", occupation: occupation || "Unknown",
                item_category: "Unknown"
            }
        });
    }
});

// Generate Image (Base64) - Fal.ai
app.post('/api/ai/image', async (req, res) => {
    if (!Fal_image_key) return res.status(500).json({ error: "Server missing Fal.ai API key." });
    const { item } = req.body;
    if (!item) return res.status(400).json({ error: "Missing item data" });

    const itemName = item.name || "mystery item";
    const itemDesc = item.desc || "unknown";
    const iconType = item.icon_type || "item";
    const visualDetails = item.visual_tags || itemDesc;
    const artStyle = resolveArtStyle(item.style_id || item.style);
    const selectedTheme = (item.theme || "none").toLowerCase();
    const styleAddon = artStyle.promptModifier;
    const visual = selectedTheme !== "none" && themeVisuals[selectedTheme] ? themeVisuals[selectedTheme] : null;
    const envAddon = visual ? `seamlessly enveloped in ${visual.environment}, ` : '';
    const colorAddon = visual ? `, utilizing ${visual.color} to create deep atmospheric weight` : '';

    let prompt = "";

    if (iconType === "person") {
        const gender = item.gender || (itemDesc.toLowerCase().includes("female") || itemDesc.toLowerCase().includes("woman") ? "Female" : "Male");
        let race = item.race || "Human";
        let occupation = item.occupation || "Adventurer";

        prompt = `A majestic close-up fantasy portrait of a ${gender} ${race} ${occupation}, wearing attire featuring ${visualDetails}, ${envAddon}centered composition, cinematic framing, looking directly forward against an artistic softly defocussed background, ${styleAddon}${colorAddon}`;
    } else if (iconType === "pet") {
        prompt = `A majestic fantasy creature portrait of ${itemName}, featuring ${visualDetails}, ${envAddon}magical beast, highly detailed pet design, centered composition, cinematic framing, ${styleAddon}${colorAddon}`;
    } else if (iconType === "weapon") {
        prompt = `A majestic fantasy game weapon icon of ${itemName}, positioned diagonally across the frame, straight, symmetrical, functional weapon design, full blade or head visible, featuring ${visualDetails}, ${envAddon}single object, centered, solid dark background, highly detailed prop design, cinematic lighting, ${styleAddon}${colorAddon}`;
    } else if (iconType === "armor") {
        prompt = buildArmorImagePrompt(itemName, visualDetails, envAddon, styleAddon, colorAddon, item.item_category);
    } else if (iconType === "magic") {
        prompt = `A majestic fantasy magical artifact icon of ${itemName}, arcane relic with glowing runes or mystical energy, featuring ${visualDetails}, ${envAddon}single object, centered, solid dark background, highly detailed prop design, cinematic lighting, ${styleAddon}${colorAddon}`;
    } else {
        prompt = `A majestic fantasy game item icon of ${itemName}, featuring ${visualDetails}, ${envAddon}single object, centered, solid dark background, highly detailed prop design, cinematic lighting, ${styleAddon}${colorAddon}`;
    }

    try {
        const response = await fetch(Fal_image_url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Key ${Fal_image_key}` 
            },
            body: JSON.stringify({
                prompt: prompt,
                image_size: "square_hd",
                num_inference_steps: 4
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Fal.ai Image Rift: ${response.status} - ${errText}`);
        }
        
        const data = await response.json();
        
        let base64Image = null;
        if (data.images && data.images[0] && data.images[0].url) {
            const imageFetch = await fetch(data.images[0].url);
            if (imageFetch.ok) {
                const buffer = await imageFetch.arrayBuffer();
                base64Image = Buffer.from(buffer).toString('base64');
            }
        }

        res.json({ image_b64: base64Image });
    } catch (error) {
        console.error("[Image Forge Fal.ai] Error:", error);
        res.status(500).json({ error: "Failed to generate image" });
    }
});

// --- DUNGEON ENCOUNTER HELPERS ---

const DUNGEON_THEMES = [
    "a cursed crypt", "a toxic swamp", "a forgotten clockwork factory",
    "an abyssal trench", "a burning village", "a frozen necropolis"
];

function parseLoadoutItems(itemListStr) {
    if (!itemListStr || !itemListStr.trim()) return [];
    const matches = itemListStr.match(/[^,]+?\([^)]+\)/g) || [];
    const items = matches.map((part) => {
        const m = part.trim().match(/^(.+?)\s*\(([^)]+)\)\s*$/);
        return m ? { name: m[1].trim(), icon_type: m[2].trim() } : null;
    }).filter(Boolean);
    if (items.length === 0) {
        return itemListStr.split(",").map((s) => ({ name: s.trim(), icon_type: "item" })).filter((i) => i.name);
    }
    return items;
}

function extractJsonFromModelOutput(raw) {
    if (!raw) return null;
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
        return JSON.parse(text.slice(start, end + 1));
    } catch {
        return null;
    }
}

function normalizeItemKey(name) {
    return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchItemName(candidate, itemNames) {
    if (!candidate) return null;
    const exact = itemNames.find((n) => n === candidate);
    if (exact) return exact;

    const candidateKey = normalizeItemKey(candidate);
    let best = null;
    let bestScore = 0;

    for (const name of itemNames) {
        const nameKey = normalizeItemKey(name);
        if (!nameKey || !candidateKey) continue;
        if (nameKey === candidateKey) return name;
        if (nameKey.includes(candidateKey) || candidateKey.includes(nameKey)) {
            const score = Math.min(nameKey.length, candidateKey.length) / Math.max(nameKey.length, candidateKey.length);
            if (score > bestScore) {
                bestScore = score;
                best = name;
            }
        }
    }
    return bestScore >= 0.55 ? best : null;
}

function trimDungeonHistory(history, maxLines = 4) {
    if (!history || !history.trim()) return "";
    const lines = history.trim().split("\n").filter(Boolean);
    return lines.slice(-maxLines).join("\n");
}

function getRoguelikeArcContext(floor) {
    if (floor === 1) {
        return "OPENING: Establish the dungeon theme, a looming boss, and why the hero descended. Keep the scene under 120 words.";
    }
    if (floor % 10 === 0) {
        return "CLIMAX BEAT: A major confrontation tied to the established boss. Survivable — the run continues deeper afterward.";
    }
    if (floor % 5 === 0) {
        return "MINI-BOSS: Escalate with a lieutenant or elite guardian connected to the main threat.";
    }
    return "DEEPER FLOOR: A new obstacle logically tied to the same theme and boss. Slightly raise the tension.";
}

function buildDungeonSystemPrompt(forcedType) {
    return `You are a fantasy roguelike dungeon master. Output valid JSON only — no markdown, no extra text.

JSON shape:
{
  "scene": "string",
  "type": "${forcedType}",
  "options": [
    {
      "item_name": "string",
      "action": "string",
      "success_scene": "string",
      "failure_scene": "string"
    }
  ]
}

Rules:
- scene: 2-4 sentences. Vivid atmosphere, immediate threat, and reference ONE loadout item by its exact name.
- type: must be exactly "${forcedType}".
- options: one entry per loadout item. Copy each item_name verbatim from the user list.
- action: one sentence. success_scene and failure_scene: one to two sentences each.
- Do not use the names Lyra or Elara.
- Match the encounter type in the scene (Combat=fighting, Stealth=sneaking, Persuasion=social, Environmental=hazards/terrain, Event=mystery or discovery).`;
}

function buildDungeonUserPrompt({ floor, forcedType, itemNames, history, theme }) {
    const itemList = itemNames.map((n) => `- ${n}`).join("\n");
    const arcContext = getRoguelikeArcContext(floor);
    const trimmedHistory = trimDungeonHistory(history);

    let prompt = `Floor: ${floor}\nDepth tier: ${Math.ceil(floor / 5)}\nEncounter type: ${forcedType}\n`;
    if (floor === 1) {
        prompt += `Dungeon theme: ${theme}\n`;
    }
    prompt += `Loadout items (copy names exactly into options):\n${itemList}\n`;
    prompt += `Narrative guidance: ${arcContext}`;
    if (trimmedHistory) {
        prompt += `\n\nRecent events (stay consistent with these):\n${trimmedHistory}`;
    }
    return prompt;
}

function validateAndNormalizeEncounter(parsed, itemNames, forcedType) {
    if (!parsed || typeof parsed.scene !== "string" || !parsed.scene.trim()) return null;

    const scene = parsed.scene.replace(/[\[\]]/g, "").trim();
    const rawOptions = Array.isArray(parsed.options) ? parsed.options : [];
    const usedIndices = new Set();

    const options = itemNames.map((itemName) => {
        let matched = null;
        for (let i = 0; i < rawOptions.length; i++) {
            if (usedIndices.has(i)) continue;
            const candidate = matchItemName(rawOptions[i]?.item_name, [itemName]);
            if (candidate === itemName) {
                matched = rawOptions[i];
                usedIndices.add(i);
                break;
            }
        }
        if (!matched) {
            for (let i = 0; i < rawOptions.length; i++) {
                if (usedIndices.has(i)) continue;
                const resolved = matchItemName(rawOptions[i]?.item_name, itemNames);
                if (resolved === itemName) {
                    matched = rawOptions[i];
                    usedIndices.add(i);
                    break;
                }
            }
        }

        if (matched) {
            return {
                item_name: itemName,
                action: String(matched.action || `Use ${itemName} to overcome this challenge.`).trim(),
                success_scene: String(matched.success_scene || `${itemName} prevails and the path opens.`).trim(),
                failure_scene: String(matched.failure_scene || `${itemName} fails and is consumed by the Abyss.`).trim(),
            };
        }

        return {
            item_name: itemName,
            action: `Invoke ${itemName} against this ${forcedType.toLowerCase()} challenge.`,
            success_scene: `${itemName} answers the call and clears a path forward.`,
            failure_scene: `${itemName} buckles under the strain and is lost to the Abyss.`,
        };
    });

    return { scene, type: forcedType, options };
}

function buildFallbackEncounter(forcedType, itemNames) {
    const options = itemNames.map((itemName) => ({
        item_name: itemName,
        action: `Invoke ${itemName} against this ${forcedType.toLowerCase()} challenge.`,
        success_scene: `${itemName} flares with defiant light, carving a way through the darkness.`,
        failure_scene: `${itemName} shatters under the pressure of the Abyss.`,
    }));

    return {
        scene: "The ambient magic fluctuates wildly, plunging the room into chaotic darkness. The Oracle cannot see this timeline clearly, but an unknown entity stirs in the shadows.",
        type: forcedType,
        options,
    };
}

async function requestDungeonEncounter(messages) {
    const response = await fetch(OPENROUTER_TEXT_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
            model: LLAMA_MODEL,
            response_format: { type: "json_object" },
            temperature: 0.75,
            max_tokens: 1400,
            messages,
        }),
    });

    if (!response.ok) throw new Error("OpenRouter Rift");
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
}

// Generate Dungeon Encounter (JSON)
app.post('/api/ai/dungeon-encounter', async (req, res) => {
    if (!OPENROUTER_API_KEY) return res.status(500).json({ error: "Server missing API key." });

    const { encounterNum, forcedType, itemListStr, history } = req.body;
    const floor = Math.max(1, parseInt(encounterNum, 10) || 1);
    const encounterType = forcedType || "Event";
    const loadout = parseLoadoutItems(itemListStr || "");
    const itemNames = loadout.map((i) => i.name);
    const theme = DUNGEON_THEMES[Math.floor(Math.random() * DUNGEON_THEMES.length)];

    const systemPrompt = buildDungeonSystemPrompt(encounterType);
    const userPrompt = buildDungeonUserPrompt({
        floor,
        forcedType: encounterType,
        itemNames,
        history: history || "",
        theme,
    });

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
    ];

    const maxAttempts = 3;

    try {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const rawOutput = await requestDungeonEncounter(
                attempt === 1
                    ? messages
                    : [
                          ...messages,
                          {
                              role: "user",
                              content: "Your previous response was invalid or incomplete. Reply again with ONLY valid JSON. Include every loadout item exactly once in options with matching item_name values.",
                          },
                      ]
            );

            const parsed = extractJsonFromModelOutput(rawOutput);
            const encounter = validateAndNormalizeEncounter(parsed, itemNames, encounterType);

            if (encounter) {
                return res.json({ encounter });
            }

            console.warn(`[Dungeon AI] Invalid encounter JSON on attempt ${attempt}/${maxAttempts}`);
        }

        console.error("[Dungeon AI] All attempts failed; returning fallback encounter.");
        return res.json({ encounter: buildFallbackEncounter(encounterType, itemNames) });
    } catch (error) {
        console.error("Dungeon AI Error:", error);
        return res.json({ encounter: buildFallbackEncounter(encounterType, itemNames) });
    }
});

// 5. START THE SERVER
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=========================================`);
    console.log(`🛡️  QUEST LOG SERVER IS ONLINE`);
    console.log(`📡 Listening on Port: ${PORT}`);
    console.log(`=========================================\n`);
});

