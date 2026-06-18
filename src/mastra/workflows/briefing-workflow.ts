import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const runBriefingStep = createStep({
  id: 'run-briefing',
  description: 'Runs the briefing agent to fetch AI news and send it to Slack',
  inputSchema: z.object({}),
  outputSchema: z.object({ result: z.string() }),
  execute: async ({ mastra }) => {
    const agent = mastra?.getAgent('briefingAgent');
    if (!agent) {
      throw new Error('briefingAgent not found');
    }

    const today = new Date().toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const response = await agent.generate([
      { role: 'user', content: `Ejecuta el briefing diario de inteligencia artificial. La fecha de hoy es: ${today}.` },
    ]);

    return { result: response.text };
  },
});

export const briefingWorkflow = createWorkflow({
  id: 'briefing-workflow',
  inputSchema: z.object({}),
  outputSchema: z.object({ result: z.string() }),
  schedule: {
    cron: '0 8 * * *',
  },
}).then(runBriefingStep);

briefingWorkflow.commit();
