const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// Production by default: React's development build is many times slower (every element
// is validated), which matters on plots with thousands of fixtures. `npm run build:dev`
// / `npm run watch` pass --mode development for readable stack traces.
module.exports = (env, argv) => ({
  mode: argv.mode || 'production',
  entry: './src/index.jsx',
  target: 'electron-renderer',
  output: {
    path: path.resolve(__dirname, 'public'),
    filename: 'bundle.js',
  },
  resolve: {
    extensions: ['.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: { loader: 'babel-loader' },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      filename: 'index.html',
      inject: false,
    }),
  ],
});
