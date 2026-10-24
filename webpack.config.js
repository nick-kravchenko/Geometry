const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

const dist = path.resolve(__dirname, "dist");

module.exports = {
  entry: {
    index: "./src/ts/index.ts"
  },
  output: {
    path: dist,
    filename: "[name].bundle.js"
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js", ".wasm"],
    alias: {
      // WASM_PKG points at another wasm-pack output, so a benchmark build leaves pkg/ alone
      pkg: process.env.WASM_PKG ? path.resolve(process.env.WASM_PKG) : path.resolve(__dirname, "pkg"),
    },
  },
  devServer: {
    static: dist,
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: path.resolve(__dirname, "static") }, // into the output path
      ],
    }),
  ],
  experiments: {
    asyncWebAssembly: true,
  },
};
