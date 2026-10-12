import type { NextFunction, Request, Response } from 'express';
import { createBasicAuthMiddleware } from './basic-auth.middleware';

type MockResponse = {
    setHeader: jest.Mock;
    status: jest.Mock;
    end: jest.Mock;
};

function createMockResponse(): MockResponse & Response {
    const res: MockResponse = {
        setHeader: jest.fn(),
        status: jest.fn(),
        end: jest.fn(),
    };
    res.setHeader.mockReturnValue(res);
    res.status.mockReturnValue(res);
    return res as MockResponse & Response;
}

function createRequest(authorization?: string): Request {
    return { headers: authorization === undefined ? {} : { authorization } } as unknown as Request;
}

function basic(credentials: string): string {
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

describe('createBasicAuthMiddleware', () => {
    const user = 'admin';
    const password = 'secret';

    it('answers 404 and never calls next when the user is unset', () => {
        // Arrange
        const middleware = createBasicAuthMiddleware(undefined, password);
        const res = createMockResponse();
        const next = jest.fn() as NextFunction;

        // Act
        middleware(createRequest(basic(`${user}:${password}`)), res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(404);
        expect(next).not.toHaveBeenCalled();
    });

    it('answers 404 when the password is an empty string', () => {
        // Arrange
        const middleware = createBasicAuthMiddleware(user, '');
        const res = createMockResponse();
        const next = jest.fn() as NextFunction;

        // Act
        middleware(createRequest(basic(`${user}:`)), res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(404);
        expect(next).not.toHaveBeenCalled();
    });

    it('answers 401 with a Basic challenge when no Authorization header is sent', () => {
        // Arrange
        const middleware = createBasicAuthMiddleware(user, password);
        const res = createMockResponse();
        const next = jest.fn() as NextFunction;

        // Act
        middleware(createRequest(), res, next);

        // Assert
        expect(res.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Basic realm="admin"');
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.end).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('answers 401 when the password is wrong', () => {
        // Arrange
        const middleware = createBasicAuthMiddleware(user, password);
        const res = createMockResponse();
        const next = jest.fn() as NextFunction;

        // Act
        middleware(createRequest(basic(`${user}:wrong`)), res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('answers 401 when the user is wrong', () => {
        // Arrange
        const middleware = createBasicAuthMiddleware(user, password);
        const res = createMockResponse();
        const next = jest.fn() as NextFunction;

        // Act
        middleware(createRequest(basic(`someone:${password}`)), res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('answers 401 when the scheme is not Basic', () => {
        // Arrange
        const middleware = createBasicAuthMiddleware(user, password);
        const res = createMockResponse();
        const next = jest.fn() as NextFunction;
        const encoded = Buffer.from(`${user}:${password}`).toString('base64');

        // Act
        middleware(createRequest(`Bearer ${encoded}`), res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('calls next when the credentials match', () => {
        // Arrange
        const middleware = createBasicAuthMiddleware(user, password);
        const res = createMockResponse();
        const next = jest.fn() as NextFunction;

        // Act
        middleware(createRequest(basic(`${user}:${password}`)), res, next);

        // Assert
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('accepts a password that contains a colon', () => {
        // Arrange
        const colonPassword = 'pa:ss:word';
        const middleware = createBasicAuthMiddleware(user, colonPassword);
        const res = createMockResponse();
        const next = jest.fn() as NextFunction;

        // Act
        middleware(createRequest(basic(`${user}:${colonPassword}`)), res, next);

        // Assert
        expect(next).toHaveBeenCalledTimes(1);
    });
});
