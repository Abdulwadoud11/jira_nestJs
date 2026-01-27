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
      if (!transitionId) {
        throw new Error('JIRA_DROPPED_TRANSITION_ID not configured');
      }

      this.logger.log(`Transitioning ${issueKey} to Dropped (transition ID: ${transitionId})`);

      await firstValueFrom(
        this.httpService.post(`/rest/api/3/issue/${issueKey}/transitions`, {
          transition: { id: transitionId },
        })
      );

      this.logger.log(`Jira issue ${issueKey} transitioned to Dropped`);
    } catch (error) {
      this.logger.error(` Transition Failed: ${this.getErrorMessage(error)}`);
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