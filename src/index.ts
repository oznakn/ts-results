function toString(val: unknown): string {
    let value = String(val);
    if (value === '[object Object]') {
        try {
            value = JSON.stringify(val);
        } catch {}
    }
    return value;
}

interface BaseOption<T> extends Iterable<T extends Iterable<infer U> ? U : never> {
    /** `true` when the Option is Some */ readonly some: boolean;
    /** `true` when the Option is None */ readonly none: boolean;

    /**
     * Returns the contained `Some` value, if exists.  Throws an error if not.
     * @param msg the message to throw if no Some value.
     */
    expect(msg: string): T;

    /**
     * Returns the contained `Some` value.
     * Because this function may throw, its use is generally discouraged.
     * Instead, prefer to handle the `None` case explicitly.
     *
     * Throws if the value is `None`.
     */
    unwrap(): T;

    /**
     * Returns the contained `Some` value or a provided default.
     *
     *  (This is the `unwrap_or` in rust)
     */
    unwrapOr<T2>(val: T2): T | T2;

    /**
     * Calls `mapper` if the Option is `Some`, otherwise returns `None`.
     * This function can be used for control flow based on `Option` values.
     */
    andThen<T2>(mapper: (val: T) => Option<T2>): Option<T2>;

    /**
     * Maps an `Option<T>` to `Option<U>` by applying a function to a contained `Some` value,
     * leaving a `None` value untouched.
     *
     * This function can be used to compose the Options of two functions.
     */
    map<U>(mapper: (val: T) => U): Option<U>;

    /**
     * Maps an `Option<T>` to a `Result<T, E>`.
     */
    toResult<E>(error: E): Result<T, E>;
}

/**
 * Contains the None value
 */
class NoneImpl implements BaseOption<never> {
    readonly some = false;
    readonly none = true;

    [Symbol.iterator](): Iterator<never, never, any> {
        return {
            next(): IteratorResult<never, never> {
                return { done: true, value: undefined! };
            },
        };
    }

    unwrapOr<T2>(val: T2): T2 {
        return val;
    }

    expect(msg: string): never {
        throw new Error(`${msg}`);
    }

    unwrap(): never {
        throw new Error(`Tried to unwrap None`);
    }

    map<T2>(_mapper: unknown): None {
        return this;
    }

    andThen<T2>(op: unknown): None {
        return this;
    }

    toResult<E>(error: E): Err<E> {
        return Err(error);
    }

    toString(): string {
        return 'None';
    }
}

// Export None as a singleton, then freeze it so it can't be modified
export const None = new NoneImpl();
export type None = NoneImpl;
Object.freeze(None);

/**
 * Contains the success value
 */
class SomeImpl<T> implements BaseOption<T> {
    static readonly EMPTY = new SomeImpl<void>(undefined);

    readonly some!: true;
    readonly none!: false;
    readonly val!: T;

    /**
     * Helper function if you know you have an Some<T> and T is iterable
     */
    [Symbol.iterator](): Iterator<T extends Iterable<infer U> ? U : never> {
        const obj = Object(this.val) as Iterable<any>;

        return Symbol.iterator in obj
            ? obj[Symbol.iterator]()
            : {
                  next(): IteratorResult<never, never> {
                      return { done: true, value: undefined! };
                  },
              };
    }

    constructor(val: T) {
        if (!(this instanceof SomeImpl)) {
            return new SomeImpl(val);
        }

        this.some = true;
        this.none = false;
        this.val = val;
    }

    unwrapOr(_val: unknown): T {
        return this.val;
    }

    expect(_msg: string): T {
        return this.val;
    }

    unwrap(): T {
        return this.val;
    }

    map<T2>(mapper: (val: T) => T2): Some<T2> {
        return Some(mapper(this.val));
    }

    andThen<T2>(mapper: (val: T) => Option<T2>): Option<T2> {
        return mapper(this.val);
    }

    toResult<E>(error: E): Ok<T> {
        return Ok(this.val);
    }

    /**
     * Returns the contained `Some` value, but never throws.
     * Unlike `unwrap()`, this method doesn't throw and is only callable on an Some<T>
     *
     * Therefore, it can be used instead of `unwrap()` as a maintainability safeguard
     * that will fail to compile if the type of the Option is later changed to a None that can actually occur.
     *
     * (this is the `into_Some()` in rust)
     */
    safeUnwrap(): T {
        return this.val;
    }

    toString(): string {
        return `Some(${toString(this.val)})`;
    }
}

// This allows Some to be callable - possible because of the es5 compilation target
export const Some = SomeImpl as typeof SomeImpl & (<T>(val: T) => SomeImpl<T>);
export type Some<T> = SomeImpl<T>;

export type Option<T> = Some<T> | None;

export type OptionSomeType<T extends Option<any>> = T extends Some<infer U> ? U : never;

export type OptionSomeTypes<T extends Option<any>[]> = {
    [key in keyof T]: T[key] extends Option<any> ? OptionSomeType<T[key]> : never;
};

export namespace Option {
    /**
     * Parse a set of `Option`s, returning an array of all `Some` values.
     * Short circuits with the first `None` found, if any
     */
    export function all<T extends Option<any>[]>(...options: T): Option<OptionSomeTypes<T>> {
        const someOption = [];
        for (let option of options) {
            if (option.some) {
                someOption.push(option.val);
            } else {
                return option as None;
            }
        }

        return Some(someOption as OptionSomeTypes<T>);
    }

    /**
     * Parse a set of `Option`s, short-circuits when an input value is `Some`.
     * If no `Some` is found, returns `None`.
     */
    export function any<T extends Option<any>[]>(...options: T): Option<OptionSomeTypes<T>[number]> {
        // short-circuits
        for (const option of options) {
            if (option.some) {
                return option as Some<OptionSomeTypes<T>[number]>;
            } else {
                return option as None;
            }
        }

        // it must be None
        return None;
    }

    export function isOption<T = any>(value: unknown): value is Option<T> {
        return value instanceof Some || value === None;
    }
}


/*
 * Missing Rust Result type methods:
 * pub fn contains<U>(&self, x: &U) -> bool
 * pub fn contains_err<F>(&self, f: &F) -> bool
 * pub fn map_or<U, F>(self, default: U, f: F) -> U
 * pub fn map_or_else<U, D, F>(self, default: D, f: F) -> U
 * pub fn and<U>(self, res: Result<U, E>) -> Result<U, E>
 * pub fn or<F>(self, res: Result<T, F>) -> Result<T, F>
 * pub fn or_else<F, O>(self, op: O) -> Result<T, F>
 * pub fn unwrap_or_else<F>(self, op: F) -> T
 * pub fn expect_err(self, msg: &str) -> E
 * pub fn unwrap_err(self) -> E
 * pub fn unwrap_or_default(self) -> T
 */
interface BaseResult<T, E> extends Iterable<T extends Iterable<infer U> ? U : never> {
    /** `true` when the result is Ok */ readonly ok: boolean;
    /** `true` when the result is Err */ readonly err: boolean;

    /**
     * Returns the contained `Ok` value, if exists.  Throws an error if not.
     * @param msg the message to throw if no Ok value.
     */
    expect(msg: string): T;

    /**
     * Returns the contained `Ok` value.
     * Because this function may throw, its use is generally discouraged.
     * Instead, prefer to handle the `Err` case explicitly.
     *
     * Throws if the value is an `Err`, with a message provided by the `Err`'s value.
     */
    unwrap(): T;

    /**
     * Returns the contained `Ok` value or a provided default.
     *
     *  @see unwrapOr
     *  @deprecated in favor of unwrapOr
     */
    else<T2>(val: T2): T | T2;

    /**
     * Returns the contained `Ok` value or a provided default.
     *
     *  (This is the `unwrap_or` in rust)
     */
    unwrapOr<T2>(val: T2): T | T2;

    /**
     * Calls `mapper` if the result is `Ok`, otherwise returns the `Err` value of self.
     * This function can be used for control flow based on `Result` values.
     */
    andThen<T2>(mapper: (val: T) => Ok<T2>): Result<T2, E>;
    andThen<E2>(mapper: (val: T) => Err<E2>): Result<T, E | E2>;
    andThen<T2, E2>(mapper: (val: T) => Result<T2, E2>): Result<T2, E | E2>;
    andThen<T2, E2>(mapper: (val: T) => Result<T2, E2>): Result<T2, E | E2>;

    /**
     * Maps a `Result<T, E>` to `Result<U, E>` by applying a function to a contained `Ok` value,
     * leaving an `Err` value untouched.
     *
     * This function can be used to compose the results of two functions.
     */
    map<U>(mapper: (val: T) => U): Result<U, E>;

    /**
     * Maps a `Result<T, E>` to `Result<T, F>` by applying a function to a contained `Err` value,
     * leaving an `Ok` value untouched.
     *
     * This function can be used to pass through a successful result while handling an error.
     */
    mapErr<F>(mapper: (val: E) => F): Result<T, F>;

    /**
     *  Converts from `Result<T, E>` to `Option<T>`, discarding the error if any
     *
     *  Similar to rust's `ok` method
     */
    toOption(): Option<T>;
}

/**
 * Contains the error value
 */
export class ErrImpl<E> implements BaseResult<never, E> {
    /** An empty Err */
    static readonly EMPTY = new ErrImpl<void>(undefined);

    readonly ok!: false;
    readonly err!: true;
    readonly val!: E;

    private readonly _stack!: string;

    [Symbol.iterator](): Iterator<never, never, any> {
        return {
            next(): IteratorResult<never, never> {
                return { done: true, value: undefined! };
            },
        };
    }

    constructor(val: E) {
        if (!(this instanceof ErrImpl)) {
            return new ErrImpl(val);
        }

        this.ok = false;
        this.err = true;
        this.val = val;

        const stackLines = new Error().stack!.split('\n').slice(2);
        if (stackLines && stackLines.length > 0 && stackLines[0].includes('ErrImpl')) {
            stackLines.shift();
        }

        this._stack = stackLines.join('\n');
    }

    /**
     * @deprecated in favor of unwrapOr
     * @see unwrapOr
     */
    else<T2>(val: T2): T2 {
        return val;
    }

    unwrapOr<T2>(val: T2): T2 {
        return val;
    }

    expect(msg: string): never {
        throw new Error(`${msg} - Error: ${toString(this.val)}\n${this._stack}`);
    }

    unwrap(): never {
        throw new Error(`Tried to unwrap Error: ${toString(this.val)}\n${this._stack}`);
    }

    map(_mapper: unknown): Err<E> {
        return this;
    }

    andThen(op: unknown): Err<E> {
        return this;
    }

    mapErr<E2>(mapper: (err: E) => E2): Err<E2> {
        return new Err(mapper(this.val));
    }

    toOption(): Option<never> {
        return None;
    }

    toString(): string {
        return `Err(${toString(this.val)})`;
    }

    get stack(): string | undefined {
        return `${this}\n${this._stack}`;
    }
}

// This allows Err to be callable - possible because of the es5 compilation target
export const Err = ErrImpl as typeof ErrImpl & (<E>(err: E) => Err<E>);
export type Err<E> = ErrImpl<E>;

/**
 * Contains the success value
 */
export class OkImpl<T> implements BaseResult<T, never> {
    static readonly EMPTY = new OkImpl<void>(undefined);

    readonly ok!: true;
    readonly err!: false;
    readonly val!: T;

    /**
     * Helper function if you know you have an Ok<T> and T is iterable
     */
    [Symbol.iterator](): Iterator<T extends Iterable<infer U> ? U : never> {
        const obj = Object(this.val) as Iterable<any>;

        return Symbol.iterator in obj
            ? obj[Symbol.iterator]()
            : {
                  next(): IteratorResult<never, never> {
                      return { done: true, value: undefined! };
                  },
              };
    }

    constructor(val: T) {
        if (!(this instanceof OkImpl)) {
            return new OkImpl(val);
        }

        this.ok = true;
        this.err = false;
        this.val = val;
    }

    /**
     * @see unwrapOr
     * @deprecated in favor of unwrapOr
     */
    else(_val: unknown): T {
        return this.val;
    }

    unwrapOr(_val: unknown): T {
        return this.val;
    }

    expect(_msg: string): T {
        return this.val;
    }

    unwrap(): T {
        return this.val;
    }

    map<T2>(mapper: (val: T) => T2): Ok<T2> {
        return new Ok(mapper(this.val));
    }

    andThen<T2>(mapper: (val: T) => Ok<T2>): Ok<T2>;
    andThen<E2>(mapper: (val: T) => Err<E2>): Result<T, E2>;
    andThen<T2, E2>(mapper: (val: T) => Result<T2, E2>): Result<T2, E2>;
    andThen<T2, E2>(mapper: (val: T) => Result<T2, E2>): Result<T2, E2> {
        return mapper(this.val);
    }

    mapErr(_mapper: unknown): Ok<T> {
        return this;
    }

    toOption(): Option<T> {
        return Some(this.val);
    }

    /**
     * Returns the contained `Ok` value, but never throws.
     * Unlike `unwrap()`, this method doesn't throw and is only callable on an Ok<T>
     *
     * Therefore, it can be used instead of `unwrap()` as a maintainability safeguard
     * that will fail to compile if the error type of the Result is later changed to an error that can actually occur.
     *
     * (this is the `into_ok()` in rust)
     */
    safeUnwrap(): T {
        return this.val;
    }

    toString(): string {
        return `Ok(${toString(this.val)})`;
    }
}

// This allows Ok to be callable - possible because of the es5 compilation target
export const Ok = OkImpl as typeof OkImpl & (<T>(val: T) => Ok<T>);
export type Ok<T> = OkImpl<T>;

export type Result<T, E> = Ok<T> | Err<E>;

export type ResultOkType<T extends Result<any, any>> = T extends Ok<infer U> ? U : never;
export type ResultErrType<T> = T extends Err<infer U> ? U : never;

export type ResultOkTypes<T extends Result<any, any>[]> = {
    [key in keyof T]: T[key] extends Result<infer U, any> ? ResultOkType<T[key]> : never;
};
export type ResultErrTypes<T extends Result<any, any>[]> = {
    [key in keyof T]: T[key] extends Result<infer U, any> ? ResultErrType<T[key]> : never;
};

export namespace Result {
    /**
     * Parse a set of `Result`s, returning an array of all `Ok` values.
     * Short circuits with the first `Err` found, if any
     */
    export function all<T extends Result<any, any>[]>(
        ...results: T
    ): Result<ResultOkTypes<T>, ResultErrTypes<T>[number]> {
        const okResult = [];
        for (let result of results) {
            if (result.ok) {
                okResult.push(result.val);
            } else {
                return result as Err<ResultErrTypes<T>[number]>;
            }
        }

        return new Ok(okResult as ResultOkTypes<T>);
    }

    /**
     * Parse a set of `Result`s, short-circuits when an input value is `Ok`.
     * If no `Ok` is found, returns an `Err` containing the collected error values
     */
    export function any<T extends Result<any, any>[]>(
        ...results: T
    ): Result<ResultOkTypes<T>[number], ResultErrTypes<T>> {
        const errResult = [];

        // short-circuits
        for (const result of results) {
            if (result.ok) {
                return result as Ok<ResultOkTypes<T>[number]>;
            } else {
                errResult.push(result.val);
            }
        }

        // it must be a Err
        return new Err(errResult as ResultErrTypes<T>);
    }

    /**
     * Wrap an operation that may throw an Error (`try-catch` style) into checked exception style
     * @param op The operation function
     */
    export function wrap<T, E = unknown>(op: () => T): Result<T, E> {
        try {
            return new Ok(op());
        } catch (e) {
            return new Err<E>(e as any);
        }
    }

    /**
     * Wrap an async operation that may throw an Error (`try-catch` style) into checked exception style
     * @param op The operation function
     */
    export function wrapAsync<T, E = unknown>(op: () => Promise<T>): Promise<Result<T, E>> {
        try {
            return op()
                .then((val) => new Ok(val))
                .catch((e) => new Err(e));
        } catch (e) {
            return Promise.resolve(new Err(e) as any);
        }
    }

    export function isResult<T = any, E = any>(val: unknown): val is Result<T, E> {
        return val instanceof Err || val instanceof Ok;
    }
}
