/**
 * Node-only entry point:
 * - code generation APIs
 * - schema loaders
 * - config file loader
 *
 * Import as: `@ptdgrp/typedgql/node`
 */
export { Generator } from "./codegen/generator";
export type { CodegenOptions } from "./codegen/options";
export { loadRemoteSchema, loadLocalSchema } from "./codegen/schema-loader";
export { loadConfig, mergeConfig } from "./codegen/config-loader";
export type { TypedGqlConfig } from "./codegen/config-loader";
