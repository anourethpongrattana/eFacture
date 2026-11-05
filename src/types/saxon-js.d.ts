declare module "saxon-js" {
  interface TransformOptions {
    stylesheetFileName?: string;
    stylesheetText?: string;
    stylesheetInternal?: unknown;
    sourceText?: string;
    sourceFileName?: string;
    destination?: "serialized" | "document" | "raw";
  }

  interface TransformResult {
    principalResult?: string;
  }

  const SaxonJS: {
    transform(
      options: TransformOptions,
      execution?: "async" | "sync",
    ): Promise<TransformResult> | TransformResult;
  };

  export default SaxonJS;
}
