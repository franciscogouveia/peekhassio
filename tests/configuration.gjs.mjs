import { buildDashboardUrl, parseConfigurationValue } from '../dist/configuration.js';
const instance = { id: 'home', name: 'Home', baseUrl: 'https://ha.example.com/' };
const group = {
    id: 'status',
    instanceId: 'home',
    name: 'Status',
    dashboardPath: '/dashboard/status',
    entities: [],
};
parseConfigurationValue({ version: 1, instances: [instance], groups: [group] });
if (buildDashboardUrl(instance, group) !== 'https://ha.example.com/dashboard/status')
    throw new Error('GLib.Uri did not resolve the dashboard path correctly');

try {
    parseConfigurationValue({ version: 1, instances: [{ ...instance, baseUrl: 'not a URL' }], groups: [group] });
    throw new Error('GLib.Uri accepted an invalid base URL');
}
catch (error) {
    if (!error.message.startsWith('Invalid configuration:'))
        throw error;
}
