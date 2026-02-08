import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { generateObject } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { z } from 'zod';
import type { RequestHandler } from './$types';

// The response schema for type safety
export interface HistoryStep {
	year: string;
	lat: number | null;
	lng: number | null;
	title: string;
	description: string;
}

export interface DishStats {
	yearsOld: string;
	servingsPerYear: string;
	globalReach: string;
}

export interface DishHistoryResponse {
	title: string;
	emoji: string;
	stats: DishStats;
	steps: HistoryStep[];
}

const SYSTEM_INSTRUCTION = `You are a world-class Food Historian and Storyteller. Trace the history of a dish through a series of rich, punchy narrative snapshots.

Return a JSON object with this exact schema:
{
  "title": "string - The dish name with a short, vivid tagline (ABSOLUTELY NO EMOJIS HERE - use the 'emoji' field instead)",
  "emoji": "string - A single emoji representing the heart of the dish",
  "stats": {
    "yearsOld": "string - The total age of the dish (e.g., '2,500', '150')",
    "servingsPerYear": "string - Estimated annual servings globally (e.g., '95 B', '400 M')",
    "globalReach": "string - Percentage of global popularity (e.g., '85%', '40%')"
  },
  "steps": [
    {
      "year": "string - The year or era (e.g., '3000 BCE', '1889')",
      "lat": "number | null - Latitude",
      "lng": "number | null - Longitude",
      "title": "string - A bold, engaging title (max 5 words)",
      "description": "string - A punchy, atmospheric story beat (max 160 chars). Use PAST TENSE. Focus on SENSORY details (scents, sounds, heat, drama). It must feel 'flavorful', not clinical. Include specific names/places."
    }
  ]
}

Requirements:
- Provide exactly 5 chronological story beats.
- **TONE**: Atmospheric and evocative, but punchy. Every sentence should drip with personality.
- **STORY OVER FACTS**: Instead of 'They brought rice', say 'Moorish travelers sowed the first golden grains...'.
- **STILL REQUIRE SPECIFICITY**: Every step MUST contain a specific entity (Person, City, Tribe, or Empire) to anchor the fact.
- Use real places with accurate coordinates. 
- Return ONLY the JSON object, no extra text`;

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Parse the request body
		const body = await request.json();
		const { dish } = body;

		if (!dish || typeof dish !== 'string') {
			throw error(400, 'Missing or invalid dish parameter');
		}

		// Get API key from SvelteKit's env system
		const apiKey = env.GROQ_API_KEY;
		if (!apiKey) {
			throw error(500, 'Groq API key not configured. Please set GROQ_API_KEY in your .env file.');
		}

		// Define the schema for validation
		const schema = z.object({
			title: z.string(),
			emoji: z.string(),
			stats: z.object({
				yearsOld: z.string(),
				servingsPerYear: z.string(),
				globalReach: z.string()
			}),
			steps: z.array(z.object({
				year: z.string(),
				lat: z.number().nullable(),
				lng: z.number().nullable(),
				title: z.string(),
				description: z.string()
			})).length(5)
		});

		// Create Groq provider with explicit API key
		const groq = createGroq({
			apiKey: apiKey
		});

		// Generate the response using Llama 4 Scout (supports structured JSON outputs)
		const { object } = await generateObject({
			model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
			system: SYSTEM_INSTRUCTION,
			prompt: `Trace the history of: ${dish}`,
			schema
		});

		return json(object);
	} catch (err: any) {
		// Re-throw SvelteKit errors
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		// Handle other errors
		console.error('Error generating dish history:', err);

		// Extract more info if available
		const message = err.message || 'An unexpected error occurred';
		throw error(500, `${message}. Please try again.`);
	}
};
