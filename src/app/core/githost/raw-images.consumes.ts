/**
 * What `RawImagesStore` reads from qits-githost's answers (qits-734). The store passes these to
 * `consume(...)`, and its pact spec binds the same.
 */

/**
 * `image(...)`: a file's bytes at one revision. The answer is no JSON: the store reads the body
 * whole, as a Blob, so the pact binds its media type (an image), never a field.
 */
export const GET_RAW = [] as const;
