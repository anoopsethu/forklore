import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import type { RequestHandler } from './$types';

// Response interface for featured dishes
export interface FeaturedDish {
    name: string;
    emoji: string;
    region: string;
    trivia: string;
    lat: number;
    lng: number;
}

export interface FeaturedResponse {
    dishes: FeaturedDish[];
}

const SYSTEM_INSTRUCTION = `You are a culinary expert. Generate a list of 12 popular dishes from around the world.

Return a JSON object with this exact schema:
{
  "dishes": [
    {
      "name": "string - dish name",
      "emoji": "string - single unicode emoji",
      "region": "string - COUNTRY NAME ONLY (e.g., 'Mexico', 'Japan', 'UK', 'Peru'). DO NOT use geographical categories like 'North America' or 'Southern Europe'.",
      "trivia": "string - one fun fact (max 10 words)",
      "lat": "number",
      "lng": "number"
    }
  ]
}

CRITICAL: GEOGRAPHICAL DISPERSION
To ensure the map looks beautiful and the globe is well-populated, you MUST select exactly ONE dish from each of these 12 distinct regions:
1. North America West (e.g., Mexico, California)
2. North America East (e.g., USA, Canada)
3. South America (e.g., Peru, Chile, Argentina)
4. South America East (e.g., Brazil, Uruguay)
5. Northern/Western Europe (e.g., UK, France, Sweden)
6. Southern Europe (e.g., Italy, Greece, Spain)
7. Africa South (e.g., South Africa, Namibia)
8. Africa West/Central (e.g., Nigeria, Ethiopia)
9. Middle East (e.g., Morocco, Lebanon, Iran)
10. South Asia (e.g., India, Pakistan)
11. East/Southeast Asia (e.g., Japan, China, Vietnam, Thailand)
12. Oceania (e.g., Australia, New Zealand)

IMPORTANT: The "region" field must be a SHORT COUNTRY NAME like "Mexico", "Japan", "India", "UK". 
DO NOT use long names like "North America (West)" or "Southern Europe/Mediterranean".
Return exactly 12 dishes.`;

// Fallback static data for when AI Gateway is unavailable
const FALLBACK_DISHES: FeaturedDish[] = [
    { name: "Poutine", emoji: "🍟", region: "Canada", trivia: "Invented in rural Quebec!", lat: 46.8139, lng: -71.2080 },
    { name: "Tacos al Pastor", emoji: "🌮", region: "Mexico", trivia: "Inspired by Lebanese immigrants", lat: 19.4326, lng: -99.1332 },
    { name: "Ceviche", emoji: "🥗", region: "Peru", trivia: "Cured in fresh citrus juices", lat: -12.0464, lng: -77.0428 },
    { name: "Feijoada", emoji: "🥘", region: "Brazil", trivia: "Hearty black bean and pork stew", lat: -23.5505, lng: -46.6333 },
    { name: "Fish and Chips", emoji: "🐟", region: "UK", trivia: "The ultimate British comfort food", lat: 51.5074, lng: -0.1278 },
    { name: "Pizza Margherita", emoji: "🍕", region: "Italy", trivia: "Named after Queen Margherita", lat: 40.8518, lng: 14.2681 },
    { name: "Bole", emoji: "🍌", region: "Nigeria", trivia: "Roasted plantain is a street staple", lat: 4.8156, lng: 7.0498 },
    { name: "Bobotie", emoji: "🥧", region: "South Africa", trivia: "National dish of South Africa", lat: -33.9249, lng: 18.4241 },
    { name: "Hummus", emoji: "🥣", region: "Lebanon", trivia: "Dating back to 13th-century Egypt", lat: 33.8938, lng: 35.5018 },
    { name: "Biryani", emoji: "🍛", region: "India", trivia: "Imported from Persia to India", lat: 17.3850, lng: 78.4867 },
    { name: "Dim Sum", emoji: "🥟", region: "China", trivia: "Literally means 'touch the heart'", lat: 22.3193, lng: 114.1694 },
    { name: "Meat Pies", emoji: "🥧", region: "Australia", trivia: "Over 270 million sold annually!", lat: -33.8688, lng: 151.2093 }
];

export const GET: RequestHandler = async () => {
    try {
        // Check if API key is configured
        const apiKey = env.OPENAI_API_KEY;
        if (!apiKey) {
            // Return fallback data if no API key
            console.log('No OpenAI API key configured, returning fallback data');
            return json({ dishes: FALLBACK_DISHES });
        }

        const schema = z.object({
            dishes: z.array(z.object({
                name: z.string(),
                emoji: z.string(),
                region: z.string(),
                trivia: z.string(),
                lat: z.number().min(-90).max(90),
                lng: z.number().min(-180).max(180)
            })).length(12)
        });

        // Create a configured OpenAI provider with our key
        const openaiStack = createOpenAI({
            apiKey: apiKey
        });

        // Generate the response using the AI SDK
        const { object } = await generateObject({
            model: openaiStack('gpt-4o-mini'),
            system: SYSTEM_INSTRUCTION,
            prompt: 'Generate 12 diverse popular dishes from around the world with interesting trivia.',
            schema
        });

        return json(object);
    } catch (err) {
        // Log the error but return fallback data so UI still works
        console.error('Error generating featured dishes:', err);
        console.log('Returning fallback data');
        return json({ dishes: FALLBACK_DISHES });
    }
};
