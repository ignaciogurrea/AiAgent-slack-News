import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const sendToSlack = createTool({
  id: 'send-to-slack',
  description: 'Sends a formatted message to a Slack channel via an incoming webhook',
  inputSchema: z.object({
    message: z.string().describe('The formatted message text to send to Slack'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
  execute: async (inputData) => {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error('SLACK_WEBHOOK_URL environment variable is not set');
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: inputData.message }),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook error: ${response.status} ${response.statusText}`);
    }

    return { success: true };
  },
});
