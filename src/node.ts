/**
 * Node-only entry point:
 * - code generation APIs
 * - schema loaders
 *
 * Import as: `@ptdgrp/typedgql/node`
 */
export { Generator } from "./codegen/generator";
export type { CodegenOptions } from "./codegen/options";
export { loadRemoteSchema, loadLocalSchema } from "./codegen/schema-loader";
