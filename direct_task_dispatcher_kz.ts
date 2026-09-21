// ==============================================================================
// Meta спам-сүзгілеріне түспейтін ақылды Direct-дожим: Gemini 2.5 Flash және Cloud Tasks арқылы нейрожелілік бағалау
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/direct_task_dispatcher_kz.ts
// ==============================================================================

import { CloudTasksClient } from '@google-cloud/tasks';

interface TaskPayload {
  recipientId: string;
  messageText: string;
  tenantId: string;
}

export class DirectTaskDispatcher {
  private client: CloudTasksClient;
  private project: string;
  private queue: string;
  private location: string;

  constructor() {
    this.client = new CloudTasksClient();
    this.project = process.env.GOOGLE_CLOUD_PROJECT || 'ozatkz-prod';
    this.queue = 'meta-direct-rate-limiter';
    this.location = 'asia-southeast1';
  }

  private calculatePoissonDelaySeconds(lambdaMinutes: number): number {
    const uniform = Math.max(Math.random(), 0.0001);
    const exponentialMinutes = -Math.log(uniform) * lambdaMinutes;
    const boundedMinutes = Math.min(Math.max(exponentialMinutes, 45), 360);
    return Math.floor(boundedMinutes * 60);
  }

  public async scheduleSafeDirectMessage(payload: TaskPayload, meanDelayMinutes: number): Promise<string> {
    const parent = this.client.queuePath(this.project, this.location, this.queue);
    const delaySeconds = this.calculatePoissonDelaySeconds(meanDelayMinutes);
    const scheduleTimeSeconds = Math.floor(Date.now() / 1000) + delaySeconds;

    const task = {
      httpRequest: {
        httpMethod: 'POST' as const,
        url: `https://gateway-dot-${this.project}.${this.location}.run.app/api/v1/meta/dispatch`,
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': process.env.INTERNAL_DISPATCH_SECRET || 'secret'
        },
        body: Buffer.from(JSON.stringify(payload)).toString('base64')
      },
      scheduleTime: {
        seconds: scheduleTimeSeconds
      }
    };

    const [response] = await this.client.createTask({ parent, task });
    return response.name || 'task-dispatched';
  }
}
