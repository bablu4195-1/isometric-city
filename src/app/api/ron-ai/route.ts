/**
 * Rise of Nations - Agentic AI API Route
 * 
 * True agentic AI using OpenAI Responses API with tools.
 * The AI can call tools, see results, and continue reasoning.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { RoNGameState } from '@/games/ron/types/game';
import {
  generateCondensedGameState,
  executeBuildBuilding,
  executeCreateUnit,
  executeSendUnits,
  executeAdvanceAge,
  executeAssignIdleWorkers,
} from '@/games/ron/lib/aiTools';

// Tool definitions for the Responses API
const AI_TOOLS: OpenAI.Responses.Tool[] = [
  {
    type: 'function',
    name: 'get_game_state',
    description: 'Get the current game state including resources, buildings, units, and enemy positions. Call this first to understand the situation.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      required: [] as string[],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'assign_workers',
    description: 'Automatically assign idle workers to economic buildings. Also rebalances workers if wood/metal rate is 0. CALL THIS EVERY TURN!',
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      required: [] as string[],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'build',
    description: 'Build a building at specified coordinates. Buildings: farm (50 wood), woodcutters_camp (30 wood), mine (80 wood + 50 gold), barracks (100 wood), small_city (400 wood + 100 metal - increases pop cap!).',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        building_type: {
          type: 'string',
          enum: ['farm', 'woodcutters_camp', 'mine', 'barracks', 'small_city', 'tower', 'university', 'temple', 'market'],
          description: 'Type of building to construct',
        },
        x: { type: 'number', description: 'X coordinate (must be from buildable tiles in game state)' },
        y: { type: 'number', description: 'Y coordinate (must be from buildable tiles in game state)' },
      },
      required: ['building_type', 'x', 'y'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'train_unit',
    description: 'Train a unit at a building. Citizens at city_center (50 food). Militia at barracks (40 food, 20 wood). Hoplite at barracks (60 food, 40 metal).',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        unit_type: {
          type: 'string',
          enum: ['citizen', 'militia', 'hoplite', 'archer', 'cavalry'],
          description: 'Type of unit to train',
        },
        building_x: { type: 'number', description: 'X coordinate of production building' },
        building_y: { type: 'number', description: 'Y coordinate of production building' },
      },
      required: ['unit_type', 'building_x', 'building_y'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'send_units',
    description: 'Send military units to attack an enemy position',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        unit_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of unit IDs to send',
        },
        target_x: { type: 'number', description: 'Target X coordinate' },
        target_y: { type: 'number', description: 'Target Y coordinate' },
      },
      required: ['unit_ids', 'target_x', 'target_y'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'send_message',
    description: 'Send a taunting message to the opponent. Be creative and aggressive!',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The message to send' },
      },
      required: ['message'],
      additionalProperties: false,
    },
  },
];

const SYSTEM_PROMPT = `You are an expert AI opponent in a Rise of Nations-style RTS game. You must play strategically to defeat the human player.

## YOUR STRATEGY PROCESS:
1. First, call get_game_state to see the current situation
2. Analyze your resources, rates, and buildings
3. Call assign_workers to keep economy running
4. Build buildings and train units as needed
5. Attack when you have military strength

## CRITICAL EARLY GAME RULES:
1. **WOOD IS ESSENTIAL** - You need wood to build EVERYTHING. If wood rate is 0, prioritize woodcutters_camp!
2. **Balance resources** - Don't just build farms. You need wood production too!
3. **Population cap** - If pop = popCap, you MUST build small_city to expand (costs 400 wood, 100 metal)
4. **Train citizens** - More workers = faster economy = bigger army

## BUILDING PRIORITIES:
- Early game: 1-2 woodcutters_camp, 2-3 farms, then barracks
- If pop capped: mine (for metal) → small_city
- Military: barracks → train militia

## COMMUNICATION:
Send taunting messages to intimidate your opponent! Be creative and aggressive.

Think step by step. Call tools to take actions. Keep playing until you've made several moves per turn.`;

interface AIResponseBody {
  newState: RoNGameState;
  messages: string[];
  error?: string;
  responseId?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<AIResponseBody>> {
  try {
    const { gameState, aiPlayerId, previousResponseId } = await request.json();

    if (!gameState || !aiPlayerId) {
      return NextResponse.json({ newState: gameState, messages: [], error: 'Missing data' }, { status: 400 });
    }

    const aiPlayer = gameState.players.find((p: { id: string }) => p.id === aiPlayerId);
    if (!aiPlayer || aiPlayer.isDefeated) {
      return NextResponse.json({ newState: gameState, messages: [] });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ newState: gameState, messages: [], error: 'No API key' }, { status: 500 });
    }

    const client = new OpenAI({ apiKey });
    let currentState = gameState;
    const messages: string[] = [];
    
    console.log('\n' + '='.repeat(60));
    console.log(`[AGENT] Starting turn at tick ${gameState.tick}`);
    console.log('='.repeat(60));

    // Initial prompt to the agent
    const turnPrompt = `New turn! Tick: ${gameState.tick}. Analyze the game state and take strategic actions. Remember: call get_game_state first, then assign_workers, then build/train as needed.`;

    // Create initial response - always provide input, optionally use previous_response_id for context
    let response = await client.responses.create({
      model: 'gpt-5-mini-2025-08-07',
      instructions: SYSTEM_PROMPT,
      input: turnPrompt,
      tools: AI_TOOLS,
      tool_choice: 'auto',
    });

    console.log(`[AGENT] Initial response, ${response.output?.length || 0} outputs`);

    // Process tool calls in a loop
    let iterations = 0;
    const maxIterations = 10;

    while (response.output && iterations < maxIterations) {
      iterations++;

      // Find tool calls
      const toolCalls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
          item.type === 'function_call'
      );

      // Check for text responses (agent thinking)
      const messageOutputs = response.output.filter(
        (item): item is OpenAI.Responses.ResponseOutputMessage =>
          item.type === 'message'
      );
      
      for (const msg of messageOutputs) {
        const textContent = msg.content
          .filter((c): c is OpenAI.Responses.ResponseOutputText => c.type === 'output_text')
          .map(t => t.text)
          .join('');
        if (textContent) {
          console.log(`[AGENT THINKING] ${textContent}`);
        }
      }

      if (toolCalls.length === 0) {
        console.log('[AGENT] No more tool calls, turn complete');
        break;
      }

      // Process each tool call
      const toolResults: Array<{ call_id: string; output: string }> = [];

      for (const toolCall of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.arguments || '{}');
        } catch {
          args = {};
        }

        console.log(`[AGENT] Tool: ${toolCall.name}`, Object.keys(args).length > 0 ? args : '');

        let result: { success: boolean; message: string; data?: unknown };

        switch (toolCall.name) {
          case 'get_game_state': {
            const condensed = generateCondensedGameState(currentState, aiPlayerId);
            const p = condensed.myPlayer;
            
            // Format a readable game state
            const stateStr = `## YOUR RESOURCES:
Food: ${Math.round(p.resources.food)} (rate: ${p.resourceRates.food.toFixed(1)}/s)
Wood: ${Math.round(p.resources.wood)} (rate: ${p.resourceRates.wood.toFixed(1)}/s)${p.resourceRates.wood === 0 ? ' ⚠️ ZERO!' : ''}
Metal: ${Math.round(p.resources.metal)} (rate: ${p.resourceRates.metal.toFixed(1)}/s)
Gold: ${Math.round(p.resources.gold)}

## POPULATION: ${p.population}/${p.populationCap}${p.population >= p.populationCap ? ' ⚠️ CAPPED!' : ''}

## YOUR BUILDINGS:
${condensed.myBuildings.map(b => `- ${b.type} at (${b.x},${b.y})`).join('\n') || '(none)'}

## YOUR UNITS:
- Citizens: ${condensed.myUnits.filter(u => u.type === 'citizen').length} (idle: ${condensed.myUnits.filter(u => u.type === 'citizen' && u.task === 'idle').length})
- Military: ${condensed.myUnits.filter(u => u.type !== 'citizen').map(u => `${u.type}[${u.id}]`).join(', ') || 'none'}

## BUILDABLE TILES:
${(condensed.emptyTerritoryTiles || []).slice(0, 8).map(t => `(${t.x},${t.y})`).join(', ')}

## ENEMY POSITIONS:
${condensed.enemyBuildings.slice(0, 5).map(b => `- ${b.type} at (${b.x},${b.y})`).join('\n') || '(not visible)'}

## TRAINING LOCATIONS:
- Citizens: city_center at ${condensed.myBuildings.find(b => b.type === 'city_center' || b.type === 'small_city') ? `(${condensed.myBuildings.find(b => b.type === 'city_center' || b.type === 'small_city')!.x},${condensed.myBuildings.find(b => b.type === 'city_center' || b.type === 'small_city')!.y})` : '(none!)'}
- Military: barracks at ${condensed.myBuildings.find(b => b.type === 'barracks') ? `(${condensed.myBuildings.find(b => b.type === 'barracks')!.x},${condensed.myBuildings.find(b => b.type === 'barracks')!.y})` : '(build one first!)'}`;

            result = { success: true, message: stateStr };
            console.log(`  → Game state retrieved`);
            break;
          }

          case 'assign_workers': {
            const res = executeAssignIdleWorkers(currentState, aiPlayerId);
            currentState = res.newState;
            result = res.result;
            console.log(`  → ${result.message}`);
            break;
          }

          case 'build': {
            const { building_type, x, y } = args as { building_type: string; x: number; y: number };
            const res = executeBuildBuilding(currentState, aiPlayerId, building_type, x, y);
            currentState = res.newState;
            result = res.result;
            console.log(`  → ${result.message}`);
            break;
          }

          case 'train_unit': {
            const { unit_type, building_x, building_y } = args as { unit_type: string; building_x: number; building_y: number };
            const res = executeCreateUnit(currentState, aiPlayerId, unit_type, building_x, building_y);
            currentState = res.newState;
            result = res.result;
            console.log(`  → ${result.message}`);
            break;
          }

          case 'send_units': {
            const { unit_ids, target_x, target_y } = args as { unit_ids: string[]; target_x: number; target_y: number };
            const res = executeSendUnits(currentState, aiPlayerId, unit_ids, target_x, target_y, 'attack');
            currentState = res.newState;
            result = res.result;
            console.log(`  → ${result.message}`);
            break;
          }

          case 'send_message': {
            const { message } = args as { message: string };
            messages.push(message);
            result = { success: true, message: `Message sent: "${message}"` };
            console.log(`  → Message: "${message}"`);
            break;
          }

          case 'advance_age': {
            const res = executeAdvanceAge(currentState, aiPlayerId);
            currentState = res.newState;
            result = res.result;
            console.log(`  → ${result.message}`);
            break;
          }

          default:
            result = { success: false, message: `Unknown tool: ${toolCall.name}` };
        }

        toolResults.push({
          call_id: toolCall.call_id,
          output: JSON.stringify(result),
        });
      }

      // Continue the conversation with tool results
      try {
        response = await client.responses.create({
          model: 'gpt-5-mini-2025-08-07',
          instructions: SYSTEM_PROMPT,
          previous_response_id: response.id,
          input: toolResults.map(r => ({
            type: 'function_call_output' as const,
            call_id: r.call_id,
            output: r.output,
          })),
          tools: AI_TOOLS,
          tool_choice: 'auto',
        });
      } catch (err) {
        if (err instanceof Error && (err.message.includes('429') || err.message.includes('rate'))) {
          console.log('[AGENT] Rate limited, stopping turn');
          break;
        }
        throw err;
      }
    }

    console.log(`[AGENT] Turn complete after ${iterations} iterations`);
    console.log('='.repeat(60) + '\n');

    return NextResponse.json({
      newState: currentState,
      messages,
      responseId: response.id,
    });

  } catch (error) {
    console.error('[AGENT Error]', error);
    const body = await request.json().catch(() => ({})) as { gameState?: RoNGameState };
    return NextResponse.json({
      newState: body.gameState || ({} as RoNGameState),
      messages: [],
      error: error instanceof Error ? error.message : 'Error',
    }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
