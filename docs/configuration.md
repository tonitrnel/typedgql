# Configuration Guide

TypedGQL supports configuration through both programmatic options and a `.typedgqlrc.toml` configuration file.

## Configuration File

Create a `.typedgqlrc.toml` file in your project root to configure code generation options:

```toml
# GraphQL schema source (required)
schema = "./schema.graphql"

# Output directory for generated files (optional)
outputDir = "./src/__generated"

# Indentation (optional, default: 4 spaces)
indent = "  "

# Type mutability options (optional)
objectEditable = false
arrayEditable = false

# Selection suffix (optional, default: "Selection")
selectionSuffix = "Selection"

# Scalar type mapping (optional)
[scalarTypeMap]
DateTime = "string"
JSON = "JsonObject"
```

See [.typedgqlrc.example.toml](../.typedgqlrc.example.toml) for a complete example with all available options.

## Configuration Priority

When using both configuration file and programmatic options, they are merged with the following priority:

1. **Programmatic options** (highest priority) - options passed to the plugin or Generator
2. **Configuration file** - options from `.typedgqlrc.toml`
3. **Defaults** (lowest priority) - built-in default values

## Vite Plugin Usage

### With Configuration File

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { typedgql } from "@ptdgrp/typedgql/vite";

export default defineConfig({
  plugins: [
    // Loads configuration from .typedgqlrc.toml
    typedgql(),
  ],
});
```

### With Programmatic Options

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { typedgql } from "@ptdgrp/typedgql/vite";

export default defineConfig({
  plugins: [
    typedgql({
      schema: "./schema.graphql",
      outputDir: "./src/__generated",
      indent: "  ",
    }),
  ],
});
```

### Mixed Configuration

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { typedgql } from "@ptdgrp/typedgql/vite";

export default defineConfig({
  plugins: [
    // Loads base config from .typedgqlrc.toml
    // Overrides schema with programmatic option
    typedgql({
      schema: "http://localhost:4000/graphql",
    }),
  ],
});
```

## Node.js Usage

### With Configuration File

```ts
import { Generator, loadConfig, loadLocalSchema } from "@ptdgrp/typedgql/node";

// Load configuration from .typedgqlrc.toml
const config = await loadConfig();

if (!config?.schema) {
  throw new Error("Schema not configured");
}

const generator = new Generator({
  ...config,
  schemaLoader: () => loadLocalSchema(config.schema),
});

await generator.generate();
```

### With Programmatic Options

```ts
import { Generator, loadLocalSchema } from "@ptdgrp/typedgql/node";

const generator = new Generator({
  schemaLoader: () => loadLocalSchema("./schema.graphql"),
  targetDir: "./src/__generated",
  indent: "  ",
});

await generator.generate();
```

### Merging Configurations

```ts
import {
  Generator,
  loadConfig,
  mergeConfig,
  loadLocalSchema,
} from "@ptdgrp/typedgql/node";

// Load file config
const fileConfig = await loadConfig();

// Merge with programmatic options
const config = mergeConfig(fileConfig, {
  schema: "./schema.graphql",
  outputDir: "./custom-output",
});

const generator = new Generator({
  ...config,
  schemaLoader: () => loadLocalSchema(config.schema!),
});

await generator.generate();
```

## CLI Usage

TypedGQL provides a command-line tool for generating types from your configuration file:

```bash
# Run code generation using .typedgqlrc.toml
npx typedgql

# Or install globally
npm install -g @ptdgrp/typedgql
typedgql

# Add to package.json scripts
{
  "scripts": {
    "codegen": "typedgql",
    "dev": "typedgql && vite"
  }
}
```

The CLI will:
1. Look for `.typedgqlrc.toml` in the current directory
2. Load the configuration
3. Generate TypeScript types based on your schema
4. Apply Prettier formatting if available (for custom output directories)

**Requirements:**
- A `.typedgqlrc.toml` configuration file must exist
- The `schema` option must be specified in the config file

**Example workflow:**

```bash
# 1. Create configuration
cat > .typedgqlrc.toml << EOF
schema = "./schema.graphql"
outputDir = "./src/__generated"
EOF

# 2. Run generation
npx typedgql

# 3. Use generated types in your code
```

## Configuration Options

### Required Options

- **`schema`**: GraphQL schema source
  - Local file path: `"./schema.graphql"`
  - Remote endpoint: `"http://localhost:4000/graphql"`

### Output Options

- **`outputDir`** / **`targetDir`**: Output directory for generated files
  - Default: `node_modules/@ptdgrp/typedgql/__generated`
  - Both names are supported; `outputDir` is an alias for `targetDir`
  - **Important**: Cannot be inside `node_modules` directory
  - When using a custom output directory (outside `node_modules`), TypedGQL will automatically detect and use Prettier for code formatting if it's installed

- **`indent`**: Indentation string used in generated files
  - Default: `"    "` (4 spaces)
  - Note: When Prettier is available and a custom `outputDir` is used, Prettier's configuration will override this setting

### Type Generation Options

- **`objectEditable`**: Whether generated object fields are writable
  - `false` (default): emit `readonly` properties
  - `true`: emit mutable properties

- **`arrayEditable`**: Whether generated array types are mutable
  - `false` (default): emit `ReadonlyArray<T>`
  - `true`: emit `Array<T>`

- **`selectionSuffix`**: Suffix for generated selection interface names
  - Default: `"Selection"`
  - Example: `User` → `UserSelection`

- **`tsEnum`**: Enum output strategy
  - `false` / `undefined`: default enum writer behavior
  - `"string"`: generate string enum style
  - `"number"`: generate numeric enum style
  - `true`: enable enum generation with default mode

### Type Mapping Options

- **`scalarTypeMap`**: Map GraphQL scalars to TypeScript types
  ```toml
  [scalarTypeMap]
  DateTime = "string"
  JSON = "JsonObject"
  UUID = "string"
  ```

- **`scalarTypeDeclarations`**: TypeScript declarations for scalar types
  - Only `type`/`interface` declarations allowed
  - Emitted into generated `scalar-types.ts` namespace
  - Use multi-line string for complex declarations
  ```toml
  scalarTypeDeclarations = """
  export interface JsonObject {
    [key: string]: JsonValue;
  }
  
  export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonObject
    | JsonValue[];
  """
  ```

### Schema Customization Options

- **`excludedTypes`**: GraphQL type names to exclude from generation
  ```toml
  excludedTypes = ["InternalType", "DebugInfo"]
  ```

- **`idFieldMap`**: Override ID field name per GraphQL type
  ```toml
  [idFieldMap]
  User = "userId"
  Post = "postId"
  ```

- **`defaultSelectionExcludeMap`**: Exclude fields from default selection (`$$`)
  ```toml
  [defaultSelectionExcludeMap]
  User = ["password", "internalData"]
  Post = ["metadata"]
  ```

### Remote Schema Options

- **`schemaHeaders`**: HTTP headers for remote schema fetching
  ```toml
  [schemaHeaders]
  Authorization = "Bearer token123"
  "X-Custom-Header" = "value"
  ```

## Custom Configuration Path

You can specify a custom configuration file path:

```ts
import { loadConfig } from "@ptdgrp/typedgql/node";

const config = await loadConfig("./config/typedgql.toml");
```

## Environment-Specific Configuration

For different environments, you can use multiple configuration files:

```ts
import { loadConfig, mergeConfig } from "@ptdgrp/typedgql/node";

const env = process.env.NODE_ENV || "development";
const baseConfig = await loadConfig("./.typedgqlrc.toml");
const envConfig = await loadConfig(`./.typedgqlrc.${env}.toml`);

const config = mergeConfig(baseConfig, envConfig ?? {});
```

## Validation

TypedGQL validates configuration options and will throw errors for:

- Missing required `schema` option
- Invalid `outputDir`/`targetDir` inside `node_modules` directory
- Invalid scalar type names in `scalarTypeMap`
- Non-existent types in `idFieldMap`
- Non-existent fields in `defaultSelectionExcludeMap`
- Invalid `scalarTypeDeclarations` syntax

## Prettier Integration

When you specify a custom `outputDir` (outside `node_modules`), TypedGQL will automatically:

1. Detect if Prettier is installed in your project
2. Format all generated files using your Prettier configuration
3. Respect your `.prettierrc` or `prettier.config.js` settings

**To enable Prettier formatting:**

```bash
# Install prettier as a dev dependency
pnpm add -D prettier

# Create a prettier config (optional, uses defaults if not present)
echo '{ "semi": true, "singleQuote": true }' > .prettierrc
```

**Note:** Prettier formatting is only applied when using a custom output directory. Files generated to the default `node_modules/@ptdgrp/typedgql/__generated` location are not formatted to improve generation speed.

## Migration from Programmatic Configuration

If you're currently using programmatic configuration, you can migrate to a configuration file:

**Before:**
```ts
typedgql({
  schema: "./schema.graphql",
  targetDir: "./src/__generated",
  indent: "  ",
  scalarTypeMap: {
    DateTime: "string",
    JSON: "JsonObject",
  },
})
```

**After:**

Create `.typedgqlrc.toml`:
```toml
schema = "./schema.graphql"
outputDir = "./src/__generated"
indent = "  "

[scalarTypeMap]
DateTime = "string"
JSON = "JsonObject"

# Optional: Add type declarations for custom scalars
scalarTypeDeclarations = """
export interface JsonObject {
  [key: string]: any;
}
"""
```

Update `vite.config.ts`:
```ts
typedgql()
```

This keeps your configuration separate from your build configuration and makes it easier to share across different tools.
