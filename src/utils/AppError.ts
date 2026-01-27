export class AppError extends Error {
    constructor(
        message: string,
        public readonly originalError?: unknown
    ) {
        super(message);
        this.name = this.constructor.name;
        // Restore prototype chain for instanceOf checks
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class AIProviderError extends AppError {
    constructor(message: string, originalError?: unknown) {
        super(message, originalError);
    }
}

export class NetworkError extends AppError {
    constructor(message: string, originalError?: unknown) {
        super(message, originalError);
    }
}

export class ConfigurationError extends AppError {
    constructor(message: string) {
        super(message);
    }
}

export class AbortError extends AppError {
    constructor(message: string = 'Operation aborted', originalError?: unknown) {
        super(message, originalError);
    }
}
