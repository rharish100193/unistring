/* eslint-env node */
const Path = require("path");
const babel = require("rollup-plugin-babel");
const resolve = require("rollup-plugin-node-resolve");
const replace = require("rollup-plugin-replace");
const pluginClassTransform = require("@babel/plugin-proposal-class-properties");
const modules = [
	{
		packageName: "unicode-string",
		entry: "../src/js/init.js",
		bundleTypes: ["esm"]
	}
];

const rollupConfig = [];

modules.forEach((module) => {
	[true, false].forEach((isDev) => {
		const entry = module.entry;
		const external = Object.keys(module.globals || {}) || [];
		const babelPlugins = [pluginClassTransform];
		const plugins = [
			resolve({
				mainFields: ["main"],
				customResolveOptions: {
					moduleDirectory: Path.resolve(__dirname, "../node_modules")
				}
			}),
			replace({
				"process.env.NODE_ENV": JSON.stringify("production")
			}),
			babel({
				babelrc: false,
				externalHelpers: false,
				plugins: babelPlugins
			})
		];
		var output = [];
		module.bundleTypes.forEach((bundleType) => {
			let fileName = entry.replace("src", "lib");
			if (isDev) {
				fileName = fileName.replace(".js", ".dev.js");
			}
			output.push({
				name: "__rollupModule",
				format: bundleType,
				file: fileName,
				globals: isDev && module.globals ? module.globals : {},
				sourceMap: "inline"
			});
		});
		rollupConfig.push({
			input: entry,
			plugins,
			treeshake: true,
			external,
			output
		});
	});
});

export default rollupConfig;