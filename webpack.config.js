const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const WasmPackPlugin = require('@wasm-tool/wasm-pack-plugin');

module.exports = {
  entry: path.resolve(__dirname, 'website/script/index.ts'),
  mode: 'development', // Use 'development' for faster rebuilds during dev
  output: {
    filename: '[name].[fullhash].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  devtool: 'source-map',
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Canvas',
      template: path.resolve(__dirname, 'website/template/index.html'),
    }),
    new WasmPackPlugin({
      crateDirectory: path.resolve(__dirname, 'wasm'),
      extraArgs: '--target web',
      outDir: path.resolve(__dirname, 'wasm/pkg'), // Ensure it's the correct output
      watchDirectories: [path.resolve(__dirname, 'wasm/src')],
    }),
    new MiniCssExtractPlugin({
      filename: '[name].css',
    }),
  ],
  experiments: {
    asyncWebAssembly: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.scss$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
      },
      {
        test: /\.(gif|png|jpe?g|svg)$/i,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: 'assets/images/[name].[ext]',
            },
          },
          {
            loader: 'image-webpack-loader',
            options: {
              mozjpeg: {
                progressive: false,
                quality: 70,
              },
            },
          },
        ],
      },
      {
        test: /\.(ogg|mp3|wav)$/i,
        type: 'asset/resource',
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    hot: true,
    compress: true,
    port: 9000,
    historyApiFallback: true,
    headers: {
      'Cache-Control': 'no-store',
    },
    client: {
      overlay: true,
    },
  },
};
