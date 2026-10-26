import { MCP_METADATA_PATH } from '../constants';

/** The metadata URL for an MCP resource URL. It sits at the origin root, whatever path the endpoint itself has. */
export function getMetadataUrl(resourceUrl: string): string {
    return new URL(`/${MCP_METADATA_PATH}`, resourceUrl).toString();
}
