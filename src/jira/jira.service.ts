import { BadGatewayException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { CreateJiraDto } from './dto/create-jira.dto';

require('dotenv').config();

@Injectable()
export class JiraService {
  private readonly logger = new Logger(JiraService.name);

  async createIssue(params: {
    summary: string;
    description: string;
    productId: string;
  }): Promise<{
    jiraKey: string;
    jiraId: string;
  }> {
    const baseUrl = process.env.DOMAIN;

    const auth = {
      username: process.env.ATLASSIAN_USERNAME!,
      password: process.env.ATLASSIAN_API_KEY!,
    };

    const data = {
      fields: {
        project: {
          key: process.env.PROJECT_KEY,
        },
        issuetype: {
          name: 'Task',
        },
        summary: params.summary,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: `${params.description}\n\nProduct ID: ${params.productId}`,
                },
              ],
            },
          ],
        },
      },
    };

    try {
      const response = await axios.post(
        `${baseUrl}/rest/api/3/issue`,
        data,
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          auth,
        },
      );

      return {
        jiraKey: response.data.key,
        jiraId: response.data.id,
      };
    } catch (error) {
      console.error('Jira API error:', error.response?.data || error.message);

      throw new BadGatewayException(
        error.response?.data?.errorMessages?.[0] ||
        'Failed to create Jira issue',
      );
    }
  }


  async updateIssue(params: CreateJiraDto): Promise<number> {
    const { issueKey, summary, description } = params;
    const auth = {
      username: process.env.ATLASSIAN_USERNAME!,
      password: process.env.ATLASSIAN_API_KEY!,
    };

    try {
      const baseUrl = process.env.DOMAIN;
      const fields: any = {};

      if (summary) fields.summary = summary;
      if (description)
        fields.description = {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: description }],
            },
          ],
        };

      const response = await axios.put(
        `${baseUrl}/rest/api/3/issue/${issueKey}`,
        { fields },
        {
          auth,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      this.logger.log(`Jira issue ${issueKey} updated successfully`);
      return response.status;

    } catch (error) {
      this.logger.error(
        `Failed to update Jira issue ${issueKey}`,
        error.response?.data || error.message,
      );
      throw new BadGatewayException('Failed to update Jira issue');
    }
  }

  async getIssue(issueKey: string): Promise<any> {

    try {
      const baseUrl = process.env.DOMAIN;
      const auth = {
        username: process.env.ATLASSIAN_USERNAME!,
        password: process.env.ATLASSIAN_API_KEY!,
      };

      const config = {
        method: 'get',
        url: baseUrl + '/rest/api/3/issue/' + issueKey,
        headers: { 'Content-Type': 'application/json' },
        auth: auth
      };
      const response = await axios.request(config);

      return response.data;
    } catch (error) {
      console.log('error: ')
      console.log(error.response.data.errorMessages[0])

      const status = error?.response?.status;
      const jiraMsg =
        error?.response?.data?.errorMessages?.join(', ') ||
        error.message ||
        'Jira request failed';

      if (status === 404) {
        throw new NotFoundException(`Jira issue not found: ${jiraMsg}`);
      }

      if (status === 401 || status === 403) {
        throw new UnauthorizedException('Jira authentication/permission failed');
      }

      throw new BadGatewayException(`Jira error: ${jiraMsg}`);

    }
  }

  async updateStatus(issueKey: string, statusID: string): Promise<number> {
    const baseUrl = process.env.DOMAIN;
    const auth = {
      username: process.env.ATLASSIAN_USERNAME!,
      password: process.env.ATLASSIAN_API_KEY!,
    };

    try {

      const config = {
        headers: { 'Content-Type': 'application/json' },
        auth: auth
      };

      //Body to pass into POST REST API Request
      // status Id => 3 = dropped, 11 = To Do, 21 = In Progress, 31 = In Review , 41 = Done
      const data = {
        transition: {
          id: statusID
        }
      };

      const response = await axios.post(`${baseUrl}` + `/rest/api/2/issue/` + issueKey +
        `/transitions`, data, config);

      //if you see that you get status of 204, that means the update worked
      console.log(response.status)
      return response.status;
    } catch (error) {
      console.error(
        'Jira transition failed',
        error?.response?.data || error.message,
      );
      throw new BadGatewayException(error.response.data.errorMessages[0]);
    }
  }

}
