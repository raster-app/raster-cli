export interface paths {
    "/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Resolve the key's organization and library scope. */
        get: {
            parameters: {
                query?: never;
                header: {
                    "Api-Version": components["parameters"]["ApiVersion"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: {
                                organizationId?: string;
                                organizationName?: string | null;
                                plan?: string | null;
                                libraries?: string[];
                            };
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/libraries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create an organization, library, and API key with no account.
         * @description Anonymous — mints the key, so send no Authorization header. https://docs.raster.app/guides/start-without-an-account
         */
        post: {
            parameters: {
                query?: never;
                header: {
                    "Api-Version": components["parameters"]["ApiVersion"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: email */
                        email: string;
                        name?: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: {
                                organizationId?: string;
                                libraryId?: string;
                                apiKey?: string;
                                /** Format: uri */
                                claimUrl?: string;
                                /** Format: date-time */
                                expiresAt?: string;
                                emailSent?: boolean;
                            };
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/organizations/{organizationId}/libraries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List libraries the key can reach. */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    pageSize?: number;
                };
                header: {
                    "Api-Version": components["parameters"]["ApiVersion"];
                };
                path: {
                    organizationId: components["parameters"]["OrganizationId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Library"][];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        /** Create a library in this organization. */
        post: {
            parameters: {
                query?: never;
                header: {
                    "Api-Version": components["parameters"]["ApiVersion"];
                };
                path: {
                    organizationId: components["parameters"]["OrganizationId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name: string;
                        slug?: string;
                    };
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Library"];
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/organizations/{organizationId}/libraries/{libraryId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Rename a library. */
        patch: {
            parameters: {
                query?: never;
                header: {
                    "Api-Version": components["parameters"]["ApiVersion"];
                };
                path: {
                    organizationId: components["parameters"]["OrganizationId"];
                    libraryId: components["parameters"]["LibraryId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Library"];
                        };
                    };
                };
                404: components["responses"]["NotFound"];
            };
        };
        trace?: never;
    };
    "/organizations/{organizationId}/libraries/{libraryId}/assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List assets (paginated, optional tag filter). */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    pageSize?: number;
                    /** @description Comma-separated tag filter, up to 5. */
                    tags?: string;
                };
                header: {
                    "Api-Version": components["parameters"]["ApiVersion"];
                };
                path: {
                    organizationId: components["parameters"]["OrganizationId"];
                    libraryId: components["parameters"]["LibraryId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Asset"][];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        /** Upload up to 20 files. */
        post: {
            parameters: {
                query?: never;
                header: {
                    "Api-Version": components["parameters"]["ApiVersion"];
                };
                path: {
                    organizationId: components["parameters"]["OrganizationId"];
                    libraryId: components["parameters"]["LibraryId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "multipart/form-data": {
                        files?: string[];
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: {
                                responseText?: string;
                                assets?: components["schemas"]["Asset"][];
                            };
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
            };
        };
        /** Move up to 100 assets to trash (soft delete). */
        delete: {
            parameters: {
                query?: never;
                header: {
                    "Api-Version": components["parameters"]["ApiVersion"];
                };
                path: {
                    organizationId: components["parameters"]["OrganizationId"];
                    libraryId: components["parameters"]["LibraryId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        ids: string[];
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: {
                                success?: boolean;
                                message?: string;
                                ids?: string[];
                            };
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/organizations/{organizationId}/libraries/{libraryId}/assets/{assetId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get one asset by id. */
        get: {
            parameters: {
                query?: never;
                header: {
                    "Api-Version": components["parameters"]["ApiVersion"];
                };
                path: {
                    organizationId: components["parameters"]["OrganizationId"];
                    libraryId: components["parameters"]["LibraryId"];
                    assetId: components["parameters"]["AssetId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Asset"];
                        };
                    };
                };
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/organizations/{organizationId}/libraries/{libraryId}/assets/{assetId}/description": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Replace one asset's description. */
        patch: {
            parameters: {
                query?: never;
                header: {
                    "Api-Version": components["parameters"]["ApiVersion"];
                };
                path: {
                    organizationId: components["parameters"]["OrganizationId"];
                    libraryId: components["parameters"]["LibraryId"];
                    assetId: components["parameters"]["AssetId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        description: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: {
                                assetId: string;
                                description: string;
                            };
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/organizations/{organizationId}/libraries/{libraryId}/assets/tag": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Apply up to 20 tags to up to 100 assets. */
        post: {
            parameters: {
                query?: never;
                header: {
                    "Api-Version": components["parameters"]["ApiVersion"];
                };
                path: {
                    organizationId: components["parameters"]["OrganizationId"];
                    libraryId: components["parameters"]["LibraryId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        assetIds: string[];
                        tags: string[];
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: {
                                taggedCount: number;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/organizations/{organizationId}/libraries/{libraryId}/assets/untag": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Remove up to 20 tags from up to 100 assets. */
        post: {
            parameters: {
                query?: never;
                header: {
                    "Api-Version": components["parameters"]["ApiVersion"];
                };
                path: {
                    organizationId: components["parameters"]["OrganizationId"];
                    libraryId: components["parameters"]["LibraryId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        assetIds: string[];
                        tags: string[];
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: {
                                untaggedCount: number;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/organizations/{organizationId}/libraries/{libraryId}/assets/transfer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Move up to 100 assets to another library. */
        post: {
            parameters: {
                query?: never;
                header: {
                    "Api-Version": components["parameters"]["ApiVersion"];
                };
                path: {
                    organizationId: components["parameters"]["OrganizationId"];
                    libraryId: components["parameters"]["LibraryId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        targetLibraryId: string;
                        assetIds: string[];
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: {
                                transferredCount: number;
                                sourceLibraryId: string;
                                targetLibraryId: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/organizations/{organizationId}/libraries/{libraryId}/tags": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List a library's tags by usage count. */
        get: {
            parameters: {
                query?: {
                    limit?: number;
                };
                header: {
                    "Api-Version": components["parameters"]["ApiVersion"];
                };
                path: {
                    organizationId: components["parameters"]["OrganizationId"];
                    libraryId: components["parameters"]["LibraryId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Tag"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/organizations/{organizationId}/search/assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Search assets across libraries (ranked, highlighted). */
        get: {
            parameters: {
                query: {
                    q: string;
                    /** @description Comma-separated library ids. */
                    libraries?: string;
                    page?: number;
                    pageSize?: number;
                };
                header: {
                    "Api-Version": components["parameters"]["ApiVersion"];
                };
                path: {
                    organizationId: components["parameters"]["OrganizationId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["SearchResult"];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Error: {
            error: {
                /** @example API_KEY_NOT_AUTHORIZED_FOR_LIBRARY */
                code: string;
                message: string;
            };
        };
        /** @description Represents a digital asset with associated metadata. */
        Asset: {
            id: string;
            width?: number | null;
            height?: number | null;
            name?: string | null;
            libraryId?: string | null;
            blurhash?: string | null;
            /** Format: uri */
            url?: string | null;
            /**
             * Format: uri
             * @description Standard-resolution thumbnail CDN URL. For higher-DPI displays use
             *     `thumbHighUrl` when present.
             */
            thumbUrl?: string | null;
            /**
             * Format: uri
             * @description Higher-resolution thumbnail CDN URL — for retina / 2× displays. May be
             *     `null` for assets uploaded before the high-res thumbnail pipeline ran.
             */
            thumbHighUrl?: string | null;
            /** Format: uri */
            thumbUrlBlurred?: string | null;
            /**
             * @description Non-destructive view variants of the asset. Each entry carries its own
             *     `parentId` pointing back to this asset.
             */
            views?: (components["schemas"]["AssetView"] | null)[] | null;
            /** @example main */
            type?: string | null;
            description?: string | null;
            tags?: (string | null)[] | null;
            /**
             * @description MIME content type of the asset (e.g. `image/jpeg`, `image/png`).
             * @example image/jpeg
             */
            contentType?: string | null;
            /**
             * @description File size in bytes. May be `null` for older assets where the upload
             *     pipeline did not stamp the size field.
             */
            size?: number | null;
            /**
             * @description Creation time as unix milliseconds. Set by the upload pipeline when
             *     the asset is first persisted; never null for assets uploaded after the
             *     `created` backfill ran.
             */
            created?: number | null;
            /**
             * @description Last-modified time as unix milliseconds. Bumped on any field change
             *     (rename, tag edit, view-edit save). Useful for cache invalidation and
             *     "sort by recently updated" UX.
             */
            updated?: number | null;
            /** @description Attribution metadata for the user who uploaded the asset. */
            uploadedBy?: components["schemas"]["Uploader"] | null;
        };
        /** @description Represents a tag associated with assets or libraries. */
        Tag: {
            id: string;
            count?: number | null;
            type?: string | null;
        };
        /** @description Represents a collection of assets. */
        Library: {
            id: string;
            name?: string | null;
            assetsCount?: number | null;
            photosCount?: number | null;
            trashCount?: number | null;
            tags?: (components["schemas"]["Tag"] | null)[] | null;
        };
        /**
         * @description Wire shape returned by the `searchAssets` query — `hits` plus the
         *     corpus-wide `found` total and the resolved 1-based `page`.
         */
        SearchResult: {
            hits: components["schemas"]["SearchHit"][];
            found: number;
            page: number;
        };
        /** @description Represents a view of an asset, including metadata. */
        AssetView: {
            id: string;
            parentId?: string | null;
            width?: number | null;
            height?: number | null;
            name?: string | null;
            /** Format: uri */
            url?: string | null;
            /** Format: uri */
            thumbUrl?: string | null;
            type?: string | null;
            metadata?: components["schemas"]["AssetViewMetadata"] | null;
        };
        /** @description Attribution metadata for the user or system that uploaded an asset. */
        Uploader: {
            /** @description Display name of the uploader. May be `null`. */
            name?: string | null;
        };
        /**
         * @description A search hit — every public `Asset` field plus optional highlights and a
         *     Typesense relevance score. Duplicates the `Asset` field list so GraphQL
         *     codegen emits a flat type matching the wire payload `searchAssets` returns
         *     (rather than relying on a non-existent interface).
         */
        SearchHit: {
            id: string;
            width?: number | null;
            height?: number | null;
            name?: string | null;
            libraryId?: string | null;
            blurhash?: string | null;
            /** Format: uri */
            url?: string | null;
            /** Format: uri */
            thumbUrl?: string | null;
            /** Format: uri */
            thumbHighUrl?: string | null;
            /** Format: uri */
            thumbUrlBlurred?: string | null;
            views?: (components["schemas"]["AssetView"] | null)[] | null;
            type?: string | null;
            description?: string | null;
            tags?: (string | null)[] | null;
            contentType?: string | null;
            size?: number | null;
            created?: number | null;
            updated?: number | null;
            uploadedBy?: components["schemas"]["Uploader"] | null;
            /**
             * @description Highlight snippets — present only when Typesense matched on the
             *     corresponding field. The `<mark>` tags are inserted by Typesense.
             */
            highlights?: components["schemas"]["SearchHitHighlights"] | null;
            /**
             * @description Typesense relevance score. Optional so a future score-less backend
             *     stays wire-compatible.
             */
            score?: number | null;
        };
        /** @description Metadata for an asset view. */
        AssetViewMetadata: {
            basedOnId?: string | null;
            created?: number | null;
            name?: string | null;
            /** Format: uri */
            url?: string | null;
        };
        /** @description Highlight snippets returned by Typesense alongside each `SearchHit`. */
        SearchHitHighlights: {
            name?: string | null;
            tags?: string[] | null;
        };
    };
    responses: {
        /** @description Missing or invalid API key. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Resource not found, or the key is not authorized for it. */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Invalid input (BAD_USER_INPUT), quota, or API-version error. */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
    };
    parameters: {
        ApiVersion: string;
        OrganizationId: string;
        LibraryId: string;
        AssetId: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
