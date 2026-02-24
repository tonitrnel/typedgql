import { defineConfig } from "vite";
import { typedgql } from "@ptdgrp/typedgql/vite";

export default defineConfig({
  plugins: [
    typedgql({
      schema: "./src/schema.graphql",
      // Optional overrides:
      // schemaHeaders: { Authorization: "Bearer <token>" },
      // tsEnum: "string",
    }),
  ],
});
