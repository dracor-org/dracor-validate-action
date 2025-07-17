export interface Params {
    schema: string;
    version: string;
    files: string;
    warnOnly: boolean;
}
export declare function trimFilePath(path: string): string;
export declare function defaultVersion(schema: string): string;
export declare function getParams(): Params;
export declare function makeUrl(filePath: string, line: number): string;
export declare function makeLink(filePath: string, line: number, text?: string): string;
export declare function truncateJingMessage(message: string): string;
