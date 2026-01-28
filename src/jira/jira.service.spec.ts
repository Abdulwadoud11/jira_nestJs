import { Test, TestingModule } from '@nestjs/testing';
import { JiraService } from './jira.service';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

describe('JiraService', () => {
    let service: JiraService;
    let httpService: HttpService;

    const mockHttpService = () => ({
        axiosRef: { defaults: {} },
        post: jest.fn(),
        put: jest.fn(),
        get: jest.fn(),
    });


    beforeEach(async () => {
        process.env.JIRA_EMAIL = 'test@example.com';
        process.env.JIRA_API_TOKEN = 'token';
        process.env.JIRA_BASE_URL = 'https://jira.example.com';
        process.env.JIRA_PROJECT_KEY = 'TEST';
        process.env.JIRA_ISSUE_TYPE = 'Task';
        process.env.JIRA_DROPPED_TRANSITION_ID = '5';
        process.env.JIRA_DROPPED_STATUS_NAME = "Dropped"

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                JiraService,
                { provide: HttpService, useFactory: mockHttpService },
            ],
        }).compile();

        service = module.get(JiraService);
        httpService = module.get(HttpService);

        jest.spyOn(service['logger'], 'error').mockImplementation(() => { });

        jest.clearAllMocks();
    });


    describe('createIssue', () => {
        it('should call HttpService.post and return Jira keys', async () => {
            const dto = { summary: 'Test Issue', description: 'Some description', productId: 123 };

            const mockResponse = {
                data: { key: 'PROJ-1', id: '1001' },
            };

            // mock HttpService.post to return an Observable
            httpService.post = jest.fn().mockReturnValue(of(mockResponse));

            // spy on logger to silence logs (optional)
            const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

            const result = await service.createIssue(dto);

            expect(httpService.post).toHaveBeenCalledWith(
                '/rest/api/3/issue',
                expect.objectContaining({
                    fields: expect.objectContaining({
                        summary: 'Test Issue',
                    }),
                })
            );

            expect(result).toEqual({ jiraKey: 'PROJ-1', jiraId: '1001' });

            logSpy.mockRestore();
        });

        it('should throw and log error if HttpService.post fails', async () => {
            const dto = { summary: 'Fail Issue' };

            const error = new Error('Jira down');

            httpService.post = jest.fn().mockReturnValue(throwError(() => error));

            const errorSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

            await expect(service.createIssue(dto)).rejects.toThrow('Jira down');

            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Create Issue Failed')
            );

            errorSpy.mockRestore();
        });
    });

    /////////////////////////////////////////////////////

    describe('updateIssue', () => {
        it('should call HttpService.put with correct fields and succeed', async () => {
            const dto = { issueKey: 'PROJ-1', summary: 'Updated Summary', description: 'Updated Desc' };

            // mock put to return Observable
            httpService.put = jest.fn().mockReturnValue(of({ data: {} }));

            const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

            await service.updateIssue(dto);

            expect(httpService.put).toHaveBeenCalledWith(
                `/rest/api/3/issue/PROJ-1`,
                expect.objectContaining({
                    fields: {
                        summary: 'Updated Summary',
                        description: {
                            type: 'doc',
                            version: 1,
                            content: [
                                { type: 'paragraph', content: [{ type: 'text', text: 'Updated Desc' }] }
                            ]
                        }
                    }
                })
            );

            expect(logSpy).toHaveBeenCalledWith(' Updating Jira issue PROJ-1');
            expect(logSpy).toHaveBeenCalledWith(' Jira issue PROJ-1 updated successfully');

            logSpy.mockRestore();
        });

        it('should throw and log error if HttpService.put fails', async () => {
            const dto = { issueKey: 'PROJ-2', summary: 'Fail Update' };

            const error = new Error('Jira down');
            httpService.put = jest.fn().mockReturnValue(throwError(() => error));

            const errorSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

            await expect(service.updateIssue(dto)).rejects.toThrow('Jira down');
            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Update Issue Failed')
            );

            errorSpy.mockRestore();
        });

        it('should handle missing description gracefully', async () => {
            const dto = { issueKey: 'PROJ-3', summary: 'Only Summary' };

            httpService.put = jest.fn().mockReturnValue(of({ data: {} }));
            const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

            await service.updateIssue(dto);

            expect(httpService.put).toHaveBeenCalledWith(
                `/rest/api/3/issue/PROJ-3`,
                expect.objectContaining({
                    fields: {
                        summary: 'Only Summary',
                    },
                })
            );

            logSpy.mockRestore();
        });
    });

    /////////////////////////////////////////////////////

    describe('getIssue', () => {
        it('should fetch Jira issue and return formatted data', async () => {
            const mockData = {
                key: 'PROJ-1',
                fields: {
                    status: { name: 'In Progress' },
                    summary: 'Test Issue',
                    description: 'Some description',
                    updated: '2026-01-27T00:00:00.000Z',
                    assignee: { displayName: 'John Doe' },
                },
            };

            httpService.get = jest.fn().mockReturnValue(of({ data: mockData }));

            const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

            const result = await service.getIssue('PROJ-1');

            expect(httpService.get).toHaveBeenCalledWith(
                `/rest/api/3/issue/PROJ-1?fields=status,summary,description,updated,assignee`
            );

            expect(result).toEqual({
                key: 'PROJ-1',
                status: 'In Progress',
                summary: 'Test Issue',
                description: 'Some description',
                updated: '2026-01-27T00:00:00.000Z',
                assignee: 'John Doe',
            });

            expect(logSpy).toHaveBeenCalledWith(' Fetching Jira issue PROJ-1');
            expect(logSpy).toHaveBeenCalledWith(' Jira issue PROJ-1 fetched: In Progress');

            logSpy.mockRestore();
        });

        it('should handle missing assignee gracefully', async () => {
            const mockData = {
                key: 'PROJ-2',
                fields: {
                    status: { name: 'Done' },
                    summary: 'No Assignee',
                    description: 'Desc',
                    updated: '2026-01-27T00:00:00.000Z',
                    assignee: null,
                },
            };

            httpService.get = jest.fn().mockReturnValue(of({ data: mockData }));

            const result = await service.getIssue('PROJ-2');

            expect(result.assignee).toBeNull();
        });

        it('should throw and log error if HttpService.get fails', async () => {
            const error = new Error('Jira down');
            httpService.get = jest.fn().mockReturnValue(throwError(() => error));

            const errorSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

            await expect(service.getIssue('PROJ-3')).rejects.toThrow('Jira down');

            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Get Issue Failed'));

            errorSpy.mockRestore();
        });
    });

    /////////////////////////////////////////////////////

    describe('updateStatus', () => {

        beforeEach(() => {
            jest.resetAllMocks();
            delete process.env.JIRA_DROPPED_TRANSITION_ID;
            delete process.env.JIRA_DROPPED_STATUS_NAME;
        });

        it('should transition Jira issue successfully using transition ID', async () => {
            process.env.JIRA_DROPPED_TRANSITION_ID = '123';

            httpService.get = jest.fn().mockReturnValue(
                of({
                    data: {
                        transitions: [
                            { id: '123', name: 'Drop Issue', to: { name: 'Dropped' } }
                        ]
                    }
                })
            );

            httpService.post = jest.fn().mockReturnValue(of({}));

            const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

            await service.updateStatus('PROJ-1');

            expect(httpService.get).toHaveBeenCalledWith(
                '/rest/api/3/issue/PROJ-1/transitions'
            );

            expect(httpService.post).toHaveBeenCalledWith(
                '/rest/api/3/issue/PROJ-1/transitions',
                { transition: { id: '123' } }
            );

            expect(logSpy).toHaveBeenCalledWith(
                'Fetching available transitions for PROJ-1'
            );

            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('Transitioning PROJ-1 to Dropped')
            );

            expect(logSpy).toHaveBeenCalledWith(
                'Jira issue PROJ-1 transitioned to Dropped successfully'
            );

            logSpy.mockRestore();
        });

        it('should throw if neither transition ID nor status name is configured', async () => {
            await expect(service.updateStatus('PROJ-2'))
                .rejects
                .toThrow(
                    'JIRA_DROPPED_TRANSITION_ID or JIRA_DROPPED_STATUS_NAME must be configured'
                );
        });

        it('should throw if configured transition ID is not available', async () => {
            process.env.JIRA_DROPPED_TRANSITION_ID = '999';

            httpService.get = jest.fn().mockReturnValue(
                of({
                    data: {
                        transitions: [
                            { id: '123', name: 'Close Issue', to: { name: 'Closed' } }
                        ]
                    }
                })
            );

            await expect(service.updateStatus('PROJ-3'))
                .rejects
                .toThrow('Transition ID 999 is not available for issue PROJ-3');
        });

        it('should log and rethrow if Jira transition POST fails', async () => {
            process.env.JIRA_DROPPED_TRANSITION_ID = '123';

            httpService.get = jest.fn().mockReturnValue(
                of({
                    data: {
                        transitions: [
                            { id: '123', name: 'Drop Issue', to: { name: 'Dropped' } }
                        ]
                    }
                })
            );

            const error = new Error('Jira down');
            httpService.post = jest.fn().mockReturnValue(
                throwError(() => error)
            );

            const errorSpy = jest
                .spyOn(service['logger'], 'error')
                .mockImplementation();

            await expect(service.updateStatus('PROJ-4'))
                .rejects
                .toThrow('Jira down');

            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Transition Failed for PROJ-4')
            );

            errorSpy.mockRestore();
        });

    });



});
