export class CreateJiraDto {
    issueKey: string;
    summary?: string;
    description?: string;
    assignee?: string;
    labels?: string[];
}
