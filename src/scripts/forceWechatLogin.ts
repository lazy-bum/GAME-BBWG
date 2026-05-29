import 'dotenv/config';
import { loginWechatMpByQrCode } from '../sources/wechatLogin.js';

try {
  await loginWechatMpByQrCode();
  // eslint-disable-next-line no-console
  console.log('微信公众平台扫码登录完成，新的登录态已保存到 config.json。');
} catch (error) {
  // eslint-disable-next-line no-console
  console.error('微信公众平台扫码登录失败', error);
  process.exitCode = 1;
}
