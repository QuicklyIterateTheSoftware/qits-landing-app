/**
 * What the app reads from qits-githost's raw read (qits-734): `RAW_FILE`
 * (`raw-images.operations.ts`) declares it as `consumes`, and its pact spec binds the same.
 */

/**
 * `RawImages.image(...)`: a file's bytes at one revision. The answer is no JSON: it is read
 * whole, as a Blob, so the pact binds its media type (an image), never a field.
 */
export const GET_RAW = [] as const;
