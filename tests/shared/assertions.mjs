/* global imports */

const JsUnit = imports.jsUnit;

export function assertThrowsMatching(callback, expected) {
    try {
        callback();
    }
    catch (error) {
        JsUnit.assertTrue(`Expected error to match ${expected}, received ${error.message}`, expected.test(error.message));
        return;
    }
    JsUnit.fail(`Expected an error matching ${expected}`);
}
