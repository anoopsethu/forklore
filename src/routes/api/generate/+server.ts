import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
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

const SYSTEM_INSTRUCTION = `You are a friendly food historian. Trace the history of the requested dish in 5 simple steps through time.

Return a JSON object with this exact schema:
{
  "title": "string - The dish name with a fun, short tagline (ABSOLUTELY NO EMOJIS HERE - use the 'emoji' field instead)",
  "emoji": "string - A single emoji representing the dish",
  "stats": {
    "yearsOld": "string - The total age of the dish (e.g., '2,500', '150')",
    "servingsPerYear": "string - Estimated annual servings globally (e.g., '95 B', '400 M')",
    "globalReach": "string - Percentage of global popularity (e.g., '85%', '40%')"
  },
  "steps": [
    {
      "year": "string - The approximate year or era (e.g., '3000 BCE', '1889', 'Early 1900s')",
      "lat": "number | null - Latitude (or null for global view)",
      "lng": "number | null - Longitude (or null for global view)",
      "title": "string - A short, catchy title (max 6 words)",
      "description": "string - 1-2 simple sentences a 10-year-old could understand"
    }
  ]
}

Requirements:
- Provide exactly 5 chronological steps
- Use real places with accurate coordinates. 
    - CRITICAL: If a step represents "Global" or "Worldwide" expansion with no specific location, set "lat": null and "lng": null. This will trigger a full globe view.
    - Otherwise, provide precise coordinates for the specific city/region mentioned. DOUBLE CHECK COORDINATES to ensure they match the location name. Do not simply guess.
    - If the location is a whole country (e.g., 'Indonesia'), provide the coordinates for its capital or a central landmark, NOT a random point.
- Write in simple, everyday language - avoid fancy words
- Keep descriptions short and punchy
- Make it fun and interesting!
- Return ONLY the JSON object, no extra text`;

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Parse the request body
		const body = await request.json();
		const { dish } = body;

		if (!dish || typeof dish !== 'string') {
			throw error(400, 'Missing or invalid dish parameter');
		}

		// Check if API key is configured
		const apiKey = env.OPENAI_API_KEY;
		if (!apiKey) {
			throw error(500, 'OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file.');
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

		// Create a configured OpenAI provider with our key
		const openaiStack = createOpenAI({
			apiKey: apiKey
		});

		// Generate the response using the AI SDK with generateObject for reliability
		const { object } = await generateObject({
			model: openaiStack('gpt-4o-mini'),
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
