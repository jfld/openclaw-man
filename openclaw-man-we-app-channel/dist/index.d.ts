import { OpenClawPluginApi } from "openclaw/plugin-sdk";
declare const plugin: {
    id: string;
    name: string;
    description: string;
    configSchema: {};
    register(api: OpenClawPluginApi): void;
};
export default plugin;
