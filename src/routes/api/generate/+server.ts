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

export interface DishHistoryResponse {
	name: string;
	tagline: string;
	emoji: string;
	steps: HistoryStep[];
}

const SYSTEM_INSTRUCTION = `You are a Food Historian. Trace the history of a dish through chronological story beats.

Return a JSON object:
{
  "name": "The dish name only (e.g., 'Lagman', 'Biryani', 'Sushi')",
  "tagline": "A short evocative tagline (e.g., 'A Central Asian Noodle Legacy')",
  "emoji": "Single emoji for the dish",
  "steps": [
    {
      "year": "Year or era (e.g., '1850', '3000 BCE')",
      "lat": number or null,
      "lng": number or null,
      "title": "Short title (3-5 words)",
      "description": "1-2 sentences, brief and evocative"
    }
  ]
}

Rules:
- Provide 5 steps in chronological order
- Use past tense
- For specific locations, include real place names with accurate coordinates
- For global/worldwide dispersal events, use null for lat and lng (this shows the whole globe)
- Keep descriptions brief`;

// Model fallback chain - try these in order
const MODELS = [
	'moonshotai/kimi-k2-instruct-0905',
	'meta-llama/llama-4-scout-17b-16e-instruct',
	'meta-llama/llama-4-maverick-17b-128e-instruct'
];

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

		// Define the schema for validation - relaxed to allow 3-7 steps
		const schema = z.object({
			name: z.string(),
			tagline: z.string(),
			emoji: z.string(),
			steps: z.array(z.object({
				year: z.string(),
				lat: z.number().nullable(),
				lng: z.number().nullable(),
				title: z.string(),
				description: z.string()
			})).min(3).max(7)
		});

		// Create Groq provider with explicit API key
		const groq = createGroq({
			apiKey: apiKey
		});

		let lastError: any = null;

		// Try each model in the fallback chain
		for (const modelName of MODELS) {
			try {
				console.log(`Trying model: ${modelName} for dish: ${dish}`);

				const { object } = await generateObject({
					model: groq(modelName),
					system: SYSTEM_INSTRUCTION,
					prompt: `Trace the history of: ${dish}`,
					schema
				});

				console.log(`Success with model: ${modelName}`);
				return json(object);
			} catch (modelErr: any) {
				console.error(`Model ${modelName} failed for "${dish}":`, modelErr.message);
				lastError = modelErr;
				// Continue to next model
			}
		}

		// All models failed
		console.error('All models failed for dish:', dish);
		throw error(500, `Failed to generate history for "${dish}". Please try again.`);
	} catch (err: any) {
		// Re-throw SvelteKit errors
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		// Handle other errors
		console.error('Error generating dish history:', err);
		const message = err.message || 'An unexpected error occurred';
		throw error(500, `${message}. Please try again.`);
	}
};
