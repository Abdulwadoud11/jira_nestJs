import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, of, throwError } from 'rxjs';

@Injectable()
export class JiraService {
  private readonly logger = new Logger(JiraService.name);

  constructor(private readonly httpService: HttpService) {
    const email = process.env.JIRA_EMAIL;
    const token = process.env.JIRA_API_TOKEN;

    if (!email || !token) {
      throw new Error('JIRA_EMAIL and JIRA_API_TOKEN must be configured');
    }

    this.httpService.axiosRef.defaults.baseURL = process.env.JIRA_BASE_URL;
    this.httpService.axiosRef.defaults.auth = {
      username: email as string,
      password: token as string,
    };
  }

  async createIssue(dto: { summary: string; description?: string; productId?: number }) {
    try {
      const description =
      {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{
              type: "text",
              text: dto.description
                ? `${dto.description}\n\nProduct ID: ${dto.productId || 'N/A'}`
                : `Product ID: ${dto.productId || 'N/A'}`
            }]
          }
        ]
      };


      const payload = {
        fields: {
          project: { key: process.env.JIRA_PROJECT_KEY },
          issuetype: { name: process.env.JIRA_ISSUE_TYPE || 'Task' },
          summary: dto.summary,
          description: description,
        },
      };

      this.logger.log(` Creating Jira issue: ${dto.summary}`);

      const { data } = await firstValueFrom(
        this.httpService.post('/rest/api/3/issue', payload)
      );


      this.logger.log(` Jira issue created: ${data.key} (ID: ${data.id})`);
      return { jiraKey: data.key, jiraId: data.id };
    } catch (error) {
      this.logger.error(` Create Issue Failed: ${this.getErrorMessage(error)}`);
      throw error;
    }
  }

  // --- 2. Update Issue ---
  async updateIssue(dto: { issueKey: string; summary?: string; description?: string }) {
    try {
      const fields: any = {};
      if (dto.summary) fields.summary = dto.summary;
      if (dto.description) fields.description = {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{
              type: "text",
              text: dto.description
            }]
          }
        ]
      };;

      this.logger.log(` Updating Jira issue ${dto.issueKey}`);

      await firstValueFrom(
        this.httpService.put(`/rest/api/3/issue/${dto.issueKey}`, { fields })
      );

      this.logger.log(` Jira issue ${dto.issueKey} updated successfully`);
    } catch (error) {
      this.logger.error(` Update Issue Failed: ${this.getErrorMessage(error)}`);
      throw error;
    }
  }

  // --- 3. Get Issue  ---
  async getIssue(issueKey: string) {
    try {
      this.logger.log(` Fetching Jira issue ${issueKey}`);

      const { data } = await firstValueFrom(
        this.httpService.get(`/rest/api/3/issue/${issueKey}?fields=status,summary,description,updated,assignee`)
      );

      this.logger.log(` Jira issue ${issueKey} fetched: ${data.fields.status.name}`);

      return {
        key: data.key,
        status: data.fields.status.name,
        summary: data.fields.summary,
        description: data.fields.description,
        updated: data.fields.updated,
        assignee: data.fields.assignee?.displayName || null,
      };
    } catch (error) {
      this.logger.error(` Get Issue Failed: ${this.getErrorMessage(error)}`);
      throw error;
    }
  }
  // --- 4. Transition to "Dropped" ---
  async updateStatus(issueKey: string) {
    try {
      const transitionId = process.env.JIRA_DROPPED_TRANSITION_ID;
      const statusName = process.env.JIRA_DROPPED_STATUS_NAME;

      if (!transitionId && !statusName) {
        throw new Error('JIRA_DROPPED_TRANSITION_ID or JIRA_DROPPED_STATUS_NAME must be configured');
      }

      // Always fetch available transitions first to verify what's possible
      this.logger.log(`Fetching available transitions for ${issueKey}`);
      const { data: transitionsData } = await firstValueFrom(
        this.httpService.get(`/rest/api/3/issue/${issueKey}/transitions`)
      );

      let targetTransition: any = null;

      if (transitionId) {
        // Verify the transition ID is available for this issue
        // Convert both to string for comparison (env vars are strings, Jira may return numbers)
        targetTransition = transitionsData.transitions.find(
          (t: any) => String(t.id) === String(transitionId)
        );

        if (!targetTransition) {
          const availableTransitions = transitionsData.transitions.map((t: any) =>
            `ID: ${t.id}, Name: ${t.name}, To: ${t.to?.name || 'N/A'}`
          ).join('; ');
          throw new Error(
            `Transition ID ${transitionId} is not available for issue ${issueKey}. ` +
            `Current status may not allow this transition. Available transitions: ${availableTransitions}`
          );
        }

        this.logger.log(`Transitioning ${issueKey} to Dropped (transition ID: ${transitionId}, name: ${targetTransition.name})`);
      } else {
        // Find transition by status name
        this.logger.log(`Finding transition to status: ${statusName}`);

        targetTransition = transitionsData.transitions.find(
          (t: any) => t.to?.name === statusName || t.name === statusName
        );

        if (!targetTransition) {
          const availableTransitions = transitionsData.transitions.map((t: any) =>
            `ID: ${t.id}, Name: ${t.name}, To: ${t.to?.name || 'N/A'}`
          ).join('; ');
          throw new Error(
            `No transition found to status "${statusName}" for issue ${issueKey}. ` +
            `Available transitions: ${availableTransitions}`
          );
        }

        this.logger.log(`Transitioning ${issueKey} to Dropped (transition ID: ${targetTransition.id}, name: ${targetTransition.name})`);
      }

      // Build transition payload
      const transitionPayload: any = {
        transition: { id: targetTransition.id },
      };

      // Check if transition requires fields (e.g., resolution, comment)
      // Some transitions may require a resolution field
      if (targetTransition.fields) {
        const requiredFields: any = {};

        // Check if resolution is required
        if (targetTransition.fields.resolution && targetTransition.fields.resolution.required) {
          // Try to find a "Dropped" or "Cancelled" resolution, or use the first available
          const resolutions = targetTransition.fields.resolution.allowedValues || [];
          const droppedResolution = resolutions.find((r: any) =>
            r.name?.toLowerCase().includes('drop') ||
            r.name?.toLowerCase().includes('cancel') ||
            r.name?.toLowerCase().includes('close')
          ) || resolutions[0];

          if (droppedResolution) {
            requiredFields.resolution = { id: droppedResolution.id };
            this.logger.log(`Adding required resolution: ${droppedResolution.name}`);
          }
        }

        if (Object.keys(requiredFields).length > 0) {
          transitionPayload.fields = requiredFields;
        }
      }

      // Execute the transition
      await firstValueFrom(
        this.httpService.post(`/rest/api/3/issue/${issueKey}/transitions`, transitionPayload)
      );

      this.logger.log(`Jira issue ${issueKey} transitioned to Dropped successfully`);
    } catch (error) {
      const errorMsg = this.getErrorMessage(error);
      this.logger.error(`Transition Failed for ${issueKey}: ${errorMsg}`);
      throw error;
    }
  }

  // --- Helper: Extract Error Message ---
  private getErrorMessage(error: any): string {
    return error.response?.data?.errorMessages?.[0]
      || JSON.stringify(error.response?.data?.errors)
      || error.message;
  }
}