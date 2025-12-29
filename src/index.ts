// Robotics Canvas App using Gemini Robotics-ER 1.5
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// ============================================================================
// Zod Schemas
// ============================================================================

const TrajectoryStepSchema = z.object({
    step_id: z.number().describe('The sequence number of the movement'),
    description: z.string().describe("What the robot is doing (e.g., 'Reaching for ball')"),
    angles: z.object({
        shoulder: z.number().min(-180).max(180).describe('Rotation in degrees'),
        elbow: z.number().min(-180).max(180).describe('Rotation in degrees'),
    }),
    target_coords: z
        .object({
            x: z.number(),
            y: z.number(),
        })
        .describe('The intended (x,y) location of the hand'),
    gripper: z.enum(['open', 'closed']).describe('State of the end-effector'),
    duration: z.number().min(0.1).describe('Time in seconds for this step'),
});

const RobotPlanSchema = z.object({
    trajectory: z.array(TrajectoryStepSchema),
});

// ============================================================================
// Types & Interfaces
// ============================================================================

type TrajectoryStep = z.infer<typeof TrajectoryStepSchema>;

interface TrajectoryResponse {
    trajectory: TrajectoryStep[];
}

interface GeminiResponse {
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string;
            }>;
        };
    }>;
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
    PORT: Number(process.env.PORT) || 3000,
    ROBOTICS_MODEL: 'gemini-robotics-er-1.5-preview',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    CANVAS_WIDTH: 1200,
    CANVAS_HEIGHT: 600,
} as const;

// ============================================================================
// Prompt Generation from Schema
// ============================================================================

function generateTrajectoryPrompt(userPrompt: string): string {
    // Schema-based field descriptions (aligned with Zod schema)
    const fieldDescriptions = {
        step_id: 'step_id: sequence number',
        description: 'description: what the robot is doing',
        angles: {
            shoulder: 'shoulder (-180 to 180 degrees)',
            elbow: 'elbow (-180 to 180 degrees)',
        },
        target_coords: {
            x: 'x coordinate of intended gripper position',
            y: 'y coordinate of intended gripper position',
        },
        gripper: 'gripper: either "open" or "closed"',
        duration: 'duration: time in seconds (minimum 0.1)',
    };

    return `You are a robotics planning system. Analyze this canvas image and the user's instruction: "${userPrompt}". 

The canvas dimensions are: width ${CONFIG.CANVAS_WIDTH}px, height ${CONFIG.CANVAS_HEIGHT}px. Coordinates use (0,0) as top-left corner, with x increasing to the right and y increasing downward.

The robot arm has:
- Base fixed at center (${CONFIG.CANVAS_WIDTH / 2}, ${CONFIG.CANVAS_HEIGHT / 2})
- Upper arm length: 150px
- Lower arm length: 120px
- Shoulder angle: -180 to 180 degrees (0 = pointing right, positive = counterclockwise)
- Elbow angle: -180 to 180 degrees (0 = fully extended/straight line, positive = bending/flexing counterclockwise relative to upper arm, negative = hyperextending clockwise relative to upper arm)

IMPORTANT: To fully extend the lower arm, set elbow angle to 0 degrees. This creates a straight line from the upper arm through the lower arm to the gripper, maximizing the reach distance.

Return a JSON object with a "trajectory" array. Each trajectory step must include:
- ${fieldDescriptions.step_id}
- ${fieldDescriptions.description}
- angles: object with ${fieldDescriptions.angles.shoulder} and ${fieldDescriptions.angles.elbow}
- target_coords: object with ${fieldDescriptions.target_coords.x} and ${fieldDescriptions.target_coords.y}
- ${fieldDescriptions.gripper}
- ${fieldDescriptions.duration}

The target_coords should match the calculated gripper position from the angles. Each step should have valid angles within the specified ranges.

IMPORTANT: Do NOT include a final step that retracts the arm to a neutral position (shoulder: 0, elbow: 0). The arm should stay in the final position after completing the task.`;
}

// ============================================================================
// Robotics Service
// ============================================================================

class RoboticsService {
    static async generateTrajectory(
        canvasImageBase64: string,
        prompt: string
    ): Promise<TrajectoryResponse> {
        if (!CONFIG.GEMINI_API_KEY) {
            throw new Error(
                'GEMINI_API_KEY environment variable is required. ' +
                    'Get your API key from https://aistudio.google.com/apikey'
            );
        }

        // Remove data URL prefix if present
        const base64Data = canvasImageBase64.includes(',')
            ? canvasImageBase64.split(',')[1]
            : canvasImageBase64;

        const requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text: generateTrajectoryPrompt(prompt),
                        },
                        {
                            inline_data: {
                                mime_type: 'image/png',
                                data: base64Data,
                            },
                        },
                    ],
                },
            ],
            generationConfig: {
                response_mime_type: 'application/json',
                temperature: 0.1,
            },
        };

        const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.ROBOTICS_MODEL}:generateContent`;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json; charset=utf-8',
            'x-goog-api-key': CONFIG.GEMINI_API_KEY,
        };

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Robotics API error: ${response.status} ${response.statusText}. ${errorText}`
            );
        }

        const responseData = (await response.json()) as GeminiResponse;

        if (!responseData.candidates || responseData.candidates.length === 0) {
            throw new Error('Robotics API returned no candidates');
        }

        const textContent = responseData.candidates[0]?.content?.parts?.[0]?.text || '{}';

        try {
            const parsedData = JSON.parse(textContent);

            // Validate using Zod schema
            const validationResult = RobotPlanSchema.safeParse(parsedData);

            if (!validationResult.success) {
                const errors = validationResult.error.errors
                    .map((err) => `${err.path.join('.')}: ${err.message}`)
                    .join('; ');
                throw new Error(`Invalid trajectory format: ${errors}`);
            }

            const planData = validationResult.data;

            if (planData.trajectory.length === 0) {
                throw new Error('Trajectory is empty');
            }

            return {
                trajectory: planData.trajectory,
            };
        } catch (parseError) {
            if (parseError instanceof Error) {
                throw parseError;
            }
            throw new Error(
                `Failed to parse trajectory response: ${parseError}. Response: ${textContent}`
            );
        }
    }
}

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ============================================================================
// API Routes
// ============================================================================

app.post('/api/generate-trajectory', async (req: Request, res: Response) => {
    try {
        const { image, prompt } = req.body;

        if (!image || !prompt) {
            return res.status(400).json({
                error: 'Both image (base64) and prompt are required',
            });
        }

        if (typeof image !== 'string' || typeof prompt !== 'string') {
            return res.status(400).json({
                error: 'Image must be a base64 string and prompt must be a string',
            });
        }

        if (prompt.trim().length === 0) {
            return res.status(400).json({
                error: 'Prompt cannot be empty',
            });
        }

        const trajectory = await RoboticsService.generateTrajectory(image, prompt);

        res.json({
            success: true,
            ...trajectory,
        });
    } catch (error: any) {
        res.status(500).json({
            error: error.message || 'Failed to generate trajectory',
            details: error.toString(),
        });
    }
});

// ============================================================================
// Server Startup
// ============================================================================

app.listen(CONFIG.PORT, () => {
    // Server started
});
