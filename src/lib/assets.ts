const basePath = import.meta.env.BASE_URL

export const assetPath = (path: string) => `${basePath}${path.replace(/^\//, '')}`
