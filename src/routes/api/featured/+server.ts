import { json } from '@sveltejs/kit';
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

// Pool of 50+ dishes organized by geographic region for global spread
// Each region has 4-5 dishes to pick from randomly
const DISH_POOL: Record<string, FeaturedDish[]> = {
    // Region 1: North America West (Mexico, California, etc.)
    northAmericaWest: [
        { name: "Tacos al Pastor", emoji: "🌮", region: "Mexico", trivia: "Inspired by Lebanese immigrants", lat: 19.4326, lng: -99.1332 },
        { name: "Mole Poblano", emoji: "🍫", region: "Mexico", trivia: "Contains over 20 ingredients", lat: 19.0414, lng: -98.2063 },
        { name: "Chilaquiles", emoji: "🫓", region: "Mexico", trivia: "Perfect hangover cure", lat: 20.6597, lng: -103.3496 },
        { name: "California Roll", emoji: "🍣", region: "USA", trivia: "Invented in Los Angeles", lat: 34.0522, lng: -118.2437 },
    ],
    // Region 2: North America East (USA, Canada)
    northAmericaEast: [
        { name: "Poutine", emoji: "🍟", region: "Canada", trivia: "Invented in rural Quebec!", lat: 46.8139, lng: -71.2080 },
        { name: "New York Pizza", emoji: "🍕", region: "USA", trivia: "Fold it like a New Yorker", lat: 40.7128, lng: -74.0060 },
        { name: "Lobster Roll", emoji: "🦞", region: "USA", trivia: "Maine's iconic summer dish", lat: 43.6591, lng: -70.2568 },
        { name: "Bagels", emoji: "🥯", region: "USA", trivia: "Boiled before baked", lat: 40.7580, lng: -73.9855 },
    ],
    // Region 3: South America West (Peru, Chile, Argentina)
    southAmericaWest: [
        { name: "Ceviche", emoji: "🥗", region: "Peru", trivia: "Cured in fresh citrus juices", lat: -12.0464, lng: -77.0428 },
        { name: "Empanadas", emoji: "🥟", region: "Argentina", trivia: "Every region has its style", lat: -34.6037, lng: -58.3816 },
        { name: "Asado", emoji: "🥩", region: "Argentina", trivia: "A social ritual, not just BBQ", lat: -34.6037, lng: -58.3816 },
        { name: "Pastel de Choclo", emoji: "🌽", region: "Chile", trivia: "Sweet corn pie with meat", lat: -33.4489, lng: -70.6693 },
    ],
    // Region 4: South America East (Brazil, Uruguay)
    southAmericaEast: [
        { name: "Feijoada", emoji: "🥘", region: "Brazil", trivia: "Hearty black bean and pork stew", lat: -23.5505, lng: -46.6333 },
        { name: "Açaí Bowl", emoji: "🫐", region: "Brazil", trivia: "Amazonian superfood", lat: -1.4558, lng: -48.4902 },
        { name: "Pão de Queijo", emoji: "🧀", region: "Brazil", trivia: "Chewy cheese bread balls", lat: -19.9167, lng: -43.9345 },
        { name: "Chivito", emoji: "🥪", region: "Uruguay", trivia: "Uruguay's ultimate sandwich", lat: -34.9011, lng: -56.1645 },
    ],
    // Region 5: Northern/Western Europe (UK, France, Germany, Scandinavia)
    northernEurope: [
        { name: "Fish and Chips", emoji: "🐟", region: "UK", trivia: "The ultimate British comfort food", lat: 51.5074, lng: -0.1278 },
        { name: "Croissant", emoji: "🥐", region: "France", trivia: "Actually from Austria!", lat: 48.8566, lng: 2.3522 },
        { name: "Waffles", emoji: "🧇", region: "Belgium", trivia: "Brussels vs Liège styles", lat: 50.8503, lng: 4.3517 },
        { name: "Smørrebrød", emoji: "🥪", region: "Denmark", trivia: "Open-faced sandwich art", lat: 55.6761, lng: 12.5683 },
    ],
    // Region 6: Southern Europe (Italy, Greece, Spain, Portugal)
    southernEurope: [
        { name: "Pizza Margherita", emoji: "🍕", region: "Italy", trivia: "Named after Queen Margherita", lat: 40.8518, lng: 14.2681 },
        { name: "Paella", emoji: "🥘", region: "Spain", trivia: "Never stir the rice!", lat: 39.4699, lng: -0.3763 },
        { name: "Moussaka", emoji: "🍆", region: "Greece", trivia: "Layered eggplant casserole", lat: 37.9838, lng: 23.7275 },
        { name: "Pastel de Nata", emoji: "🥧", region: "Portugal", trivia: "Monks invented this custard tart", lat: 38.7223, lng: -9.1393 },
    ],
    // Region 7: Africa South (South Africa, Namibia)
    africaSouth: [
        { name: "Bobotie", emoji: "🥧", region: "South Africa", trivia: "National dish of South Africa", lat: -33.9249, lng: 18.4241 },
        { name: "Bunny Chow", emoji: "🍞", region: "South Africa", trivia: "Curry in a bread bowl", lat: -29.8587, lng: 31.0218 },
        { name: "Biltong", emoji: "🥓", region: "South Africa", trivia: "Dried cured meat snack", lat: -25.7479, lng: 28.2293 },
        { name: "Potjiekos", emoji: "🍲", region: "South Africa", trivia: "Slow-cooked in a cast iron pot", lat: -26.2041, lng: 28.0473 },
    ],
    // Region 8: Africa West/Central (Nigeria, Ethiopia, Morocco)
    africaWest: [
        { name: "Jollof Rice", emoji: "🍚", region: "Nigeria", trivia: "The great West African debate", lat: 6.5244, lng: 3.3792 },
        { name: "Injera", emoji: "🫓", region: "Ethiopia", trivia: "Spongy sourdough flatbread", lat: 9.0320, lng: 38.7469 },
        { name: "Bole", emoji: "🍌", region: "Nigeria", trivia: "Roasted plantain is a street staple", lat: 4.8156, lng: 7.0498 },
        { name: "Suya", emoji: "🍢", region: "Nigeria", trivia: "Spicy skewered street meat", lat: 9.0579, lng: 7.4951 },
    ],
    // Region 9: Middle East (Lebanon, Iran, Turkey, Egypt)
    middleEast: [
        { name: "Hummus", emoji: "🥣", region: "Lebanon", trivia: "Dating back to 13th-century Egypt", lat: 33.8938, lng: 35.5018 },
        { name: "Shawarma", emoji: "🌯", region: "Lebanon", trivia: "Rotating spit of deliciousness", lat: 33.8938, lng: 35.5018 },
        { name: "Falafel", emoji: "🧆", region: "Egypt", trivia: "Ancient Egyptian origins", lat: 30.0444, lng: 31.2357 },
        { name: "Kebabs", emoji: "🍢", region: "Turkey", trivia: "Countless regional variations", lat: 41.0082, lng: 28.9784 },
    ],
    // Region 10: South Asia (India, Pakistan, Sri Lanka)
    southAsia: [
        { name: "Biryani", emoji: "🍛", region: "India", trivia: "Imported from Persia to India", lat: 17.3850, lng: 78.4867 },
        { name: "Butter Chicken", emoji: "🍗", region: "India", trivia: "Invented in 1950s Delhi", lat: 28.6139, lng: 77.2090 },
        { name: "Dosa", emoji: "🫓", region: "India", trivia: "Fermented rice crepe", lat: 13.0827, lng: 80.2707 },
        { name: "Nihari", emoji: "🍲", region: "Pakistan", trivia: "Slow-cooked overnight stew", lat: 24.8607, lng: 67.0011 },
    ],
    // Region 11: East/Southeast Asia (Japan, China, Thailand, Vietnam)
    eastAsia: [
        { name: "Sushi", emoji: "🍣", region: "Japan", trivia: "Rice was for preservation", lat: 35.6762, lng: 139.6503 },
        { name: "Dim Sum", emoji: "🥟", region: "China", trivia: "Literally means 'touch the heart'", lat: 22.3193, lng: 114.1694 },
        { name: "Pho", emoji: "🍜", region: "Vietnam", trivia: "French influence on the broth", lat: 21.0285, lng: 105.8542 },
        { name: "Pad Thai", emoji: "🍝", region: "Thailand", trivia: "Created during WWII", lat: 13.7563, lng: 100.5018 },
        { name: "Ramen", emoji: "🍜", region: "Japan", trivia: "Each region has its own style", lat: 33.5904, lng: 130.4017 },
    ],
    // Region 12: Oceania (Australia, New Zealand)
    oceania: [
        { name: "Meat Pies", emoji: "🥧", region: "Australia", trivia: "Over 270 million sold annually!", lat: -33.8688, lng: 151.2093 },
        { name: "Pavlova", emoji: "🍰", region: "New Zealand", trivia: "Named after a Russian ballerina", lat: -41.2866, lng: 174.7756 },
        { name: "Lamingtons", emoji: "🍫", region: "Australia", trivia: "Sponge cake coated in chocolate", lat: -27.4698, lng: 153.0251 },
        { name: "Vegemite Toast", emoji: "🍞", region: "Australia", trivia: "Love it or hate it", lat: -37.8136, lng: 144.9631 },
    ],
    // Region 13: Central America & Caribbean
    centralAmericaCaribbean: [
        { name: "Gallo Pinto", emoji: "🍚", region: "Costa Rica", trivia: "Breakfast of champions", lat: 9.9281, lng: -84.0907 },
        { name: "Jerk Chicken", emoji: "🍗", region: "Jamaica", trivia: "Spiced and smoked to perfection", lat: 18.1096, lng: -77.2975 },
        { name: "Pupusas", emoji: "🫓", region: "El Salvador", trivia: "Stuffed corn tortillas", lat: 13.6929, lng: -89.2182 },
        { name: "Ropa Vieja", emoji: "🥩", region: "Cuba", trivia: "Shredded beef means 'old clothes'", lat: 23.1136, lng: -82.3666 },
    ],
    // Region 14: Eastern Europe (Russia, Poland, Ukraine)
    easternEurope: [
        { name: "Borscht", emoji: "🍲", region: "Ukraine", trivia: "The famous beetroot soup", lat: 50.4501, lng: 30.5234 },
        { name: "Pierogi", emoji: "🥟", region: "Poland", trivia: "Stuffed dumplings", lat: 52.2297, lng: 21.0122 },
        { name: "Beef Stroganoff", emoji: "🍖", region: "Russia", trivia: "Named after the Stroganov family", lat: 55.7558, lng: 37.6173 },
        { name: "Goulash", emoji: "🍲", region: "Hungary", trivia: "Shepherds' stew turned national dish", lat: 47.4979, lng: 19.0402 },
    ],
    // Region 15: Central Asia (Kazakhstan, Uzbekistan, etc.)
    centralAsia: [
        { name: "Plov", emoji: "🍚", region: "Uzbekistan", trivia: "The king of Central Asian rice", lat: 41.2995, lng: 69.2401 },
        { name: "Manti", emoji: "🥟", region: "Kazakhstan", trivia: "Steamed dumplings with lamb", lat: 43.2220, lng: 76.8512 },
        { name: "Lagman", emoji: "🍜", region: "Uzbekistan", trivia: "Hand-pulled noodle soup", lat: 39.6542, lng: 66.9597 },
        { name: "Shashlik", emoji: "🍢", region: "Kazakhstan", trivia: "Skewered and grilled meat", lat: 51.1694, lng: 71.4491 },
    ],
};

// Get all region keys for iteration
const REGIONS = Object.keys(DISH_POOL);

// Function to randomly select one dish from each region
function selectRandomDishes(): FeaturedDish[] {
    const selected: FeaturedDish[] = [];

    for (const region of REGIONS) {
        const dishes = DISH_POOL[region];
        const randomIndex = Math.floor(Math.random() * dishes.length);
        selected.push(dishes[randomIndex]);
    }

    // Shuffle the final array so dishes don't always appear in the same regional order
    for (let i = selected.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [selected[i], selected[j]] = [selected[j], selected[i]];
    }

    return selected;
}

export const GET: RequestHandler = async () => {
    // Always use static data with random selection for instant response
    const dishes = selectRandomDishes();
    return json({ dishes });
};
