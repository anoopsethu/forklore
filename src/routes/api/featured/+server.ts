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

const SYSTEM_INSTRUCTION = `You are a culinary expert. Generate a list of 10 popular dishes from around the world.

Return a JSON object with this exact schema:
{
  "dishes": [
    {
      "name": "string - The dish name (e.g., 'Sushi', 'Pizza Margherita')",
      "emoji": "string - A single UNICODE EMOJI CHARACTER representing the dish. DO NOT use words or descriptions (e.g., use 🥘 instead of 'stew', use 🍲 instead of 'soup')",
      "region": "string - The origin region/country (e.g., 'Japan', 'Italy')",
      "trivia": "string - One fun, interesting fact about this dish (max 10 words)",
      "lat": "number - Latitude of the dish's origin city/region",
      "lng": "number - Longitude of the dish's origin city/region"
    }
  ]
}

Requirements:
- Return exactly 10 dishes.
- Choose dishes from DIFFERENT continents and regions for diversity.
- Include a mix of well-known and interesting regional dishes.
- Trivia should be surprising, fun facts (e.g., "Originally a peasant food!", "Named after a queen").
- Use accurate coordinates for the dish's origin city or region center.
- Each dish MUST have a single distinct unicode emoji character.
- Return ONLY the JSON object, no extra text.

COORDINATE ACCURACY IS CRITICAL:
- Latitude (lat): Northern hemisphere is POSITIVE (+), Southern hemisphere is NEGATIVE (-).
- Longitude (lng): Eastern hemisphere is POSITIVE (+), Western hemisphere (Americas) is NEGATIVE (-).
- Double check: Brazil/USA/Mexico longitudes MUST BE NEGATIVE. Australia/Japan/China/South Africa longitudes MUST BE POSITIVE.
- Ensure the point is on LAND, not in the ocean.`;

// Fallback static data for when AI Gateway is unavailable
const FALLBACK_DISHES: FeaturedDish[] = [
    { name: "Sushi", emoji: "🍣", region: "Japan", trivia: "Originally a street food!", lat: 35.6762, lng: 139.6503 },
    { name: "Pizza Margherita", emoji: "🍕", region: "Italy", trivia: "Named after a queen", lat: 40.8518, lng: 14.2681 },
    { name: "Tacos", emoji: "🌮", region: "Mexico", trivia: "Over 500 years old!", lat: 19.4326, lng: -99.1332 },
    { name: "Feijoada", emoji: "🥘", region: "Brazil", trivia: "A hearty Black Bean Stew", lat: -15.7975, lng: -47.8919 },
    { name: "Bobotie", emoji: "🥧", region: "South Africa", trivia: "Spiced minced meat dish", lat: -33.9249, lng: 18.4241 },
    { name: "Pad Thai", emoji: "🍜", region: "Thailand", trivia: "Created during WWII", lat: 13.7563, lng: 100.5018 },
    { name: "Croissant", emoji: "🥐", region: "France", trivia: "Actually from Austria!", lat: 48.8566, lng: 2.3522 },
    { name: "Dim Sum", emoji: "🥟", region: "China", trivia: "Means 'touch the heart'", lat: 22.3193, lng: 114.1694 },
    { name: "Falafel", emoji: "🧆", region: "Middle East", trivia: "Ancient Egyptian origins", lat: 30.0444, lng: 31.2357 },
    { name: "Meat Pies", emoji: "🥧", region: "Australia", trivia: "The national snack", lat: -33.8688, lng: 151.2093 }
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
            })).length(10)
        });

        // Create a configured OpenAI provider with our key
        const openaiStack = createOpenAI({
            apiKey: apiKey
        });

        // Generate the response using the AI SDK
        const { object } = await generateObject({
            model: openaiStack('gpt-4o-mini'),
            system: SYSTEM_INSTRUCTION,
            prompt: 'Generate 10 diverse popular dishes from around the world with interesting trivia.',
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
