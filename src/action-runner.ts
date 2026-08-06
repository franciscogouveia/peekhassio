export function runSafely(
    action: () => void,
    reportError: (error: unknown) => void,
    reportReportingError: (error: unknown) => void,
): void {
    try {
        action();
    }
    catch (error) {
        try {
            reportError(error);
        }
        catch (reportingError) {
            reportReportingError(reportingError);
        }
    }
}
