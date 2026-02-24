import { type GraphQLSchema } from "graphql";

export interface CodegenOptions {
    readonly schemaLoader: () => Promise<GraphQLSchema>;
    readonly targetDir?: string;
    readonly indent?: string;
    readonly objectEditable?: boolean;
    readonly arrayEditable?: boolean;
    readonly selectionSuffix?: string;
    readonly excludedTypes?: ReadonlyArray<string>;
    readonly scalarTypeMap?: {
        readonly [key: string]:
        | string
        | { readonly typeName: string; readonly importSource: string };
    };
    readonly idFieldMap?: { readonly [key: string]: string };
    readonly defaultSelectionExcludeMap?: { readonly [key: string]: string[] };
    readonly tsEnum?: boolean | "string" | "number";
}
