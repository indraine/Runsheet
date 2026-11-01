/** File size for the export dialog: `812 КБ`, `3.4 МБ`; `binary` units, one decimal over 1 MB. */
export const formatFileSize = (
    bytes: number,
    units: { kb: string; mb: string; b: string },
    locale: string
): string => {
    const number = (value: number, digits: number) =>
        new Intl.NumberFormat(locale, {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        }).format(value)
    if (bytes >= 1024 * 1024)
        return `${number(bytes / (1024 * 1024), 1)} ${units.mb}`
    if (bytes >= 1024)
        return `${number(Math.round(bytes / 1024), 0)} ${units.kb}`
    return `${number(bytes, 0)} ${units.b}`
}
