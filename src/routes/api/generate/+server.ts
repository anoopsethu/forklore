import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { generateText } from 'ai';
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
	title: string;
	emoji: string;
	steps: HistoryStep[];
}

const SYSTEM_INSTRUCTION = `You are a friendly food historian. Trace the history of the requested dish in 5 simple steps through time.

Return a JSON object with this exact schema:
{
  "title": "string - The dish name with a fun, short tagline (ABSOLUTELY NO EMOJIS HERE - use the 'emoji' field instead)",
  "emoji": "string - A single emoji representing the dish",
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
		const apiKey = env.AI_GATEWAY_API_KEY;
		if (!apiKey) {
			throw error(500, 'AI Gateway API key not configured. Please set AI_GATEWAY_API_KEY in your .env file.');
		}

		// Generate the response using the AI SDK with Vercel AI Gateway
		// Model format: provider/model-name
		const result = await generateText({
			model: 'google/gemini-2.0-flash',
			system: SYSTEM_INSTRUCTION,
			prompt: `Trace the history of: ${dish}`
		});

		const text = result.text;

		if (!text) {
			console.error('No text in response');
			throw error(500, 'No response from AI. Please try again.');
		}

		// Parse and validate the JSON response
		let parsedResponse: DishHistoryResponse;

		try {
			// Clean up the response if it has markdown code blocks
			let cleanText = text.trim();
			if (cleanText.startsWith('```json')) {
				cleanText = cleanText.slice(7);
			}
			if (cleanText.startsWith('```')) {
				cleanText = cleanText.slice(3);
			}
			if (cleanText.endsWith('```')) {
				cleanText = cleanText.slice(0, -3);
			}
			parsedResponse = JSON.parse(cleanText.trim());
		} catch {
			console.error('Failed to parse AI response as JSON:', text);
			throw error(500, 'Failed to parse AI response. Please try again.');
		}

		// Validate the response structure
		if (!parsedResponse.title || !parsedResponse.emoji || !Array.isArray(parsedResponse.steps)) {
			console.error('Invalid response structure:', parsedResponse);
			throw error(500, 'Invalid response structure from AI. Please try again.');
		}

		// Validate each step has required fields
		for (const step of parsedResponse.steps) {
			if (
				typeof step.year !== 'string' ||
				(typeof step.lat !== 'number' && step.lat !== null) ||
				(typeof step.lng !== 'number' && step.lng !== null) ||
				typeof step.title !== 'string' ||
				typeof step.description !== 'string'
			) {
				console.error('Invalid step structure:', step);
				throw error(500, 'Invalid step structure from AI. Please try again.');
			}

			// Validate coordinate ranges if not null
			if (step.lat !== null && step.lng !== null) {
				if (step.lat < -90 || step.lat > 90 || step.lng < -180 || step.lng > 180) {
					console.error('Invalid coordinates:', step);
					throw error(500, 'Invalid coordinates from AI. Please try again.');
				}
			}
		}

		return json(parsedResponse);
	} catch (err) {
		// Re-throw SvelteKit errors
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		// Handle other errors
		console.error('Error generating dish history:', err);
		throw error(500, 'An unexpected error occurred. Please try again.');
	}
};
