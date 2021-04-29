import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as AutoUpdateWafIpSetOfCloudFrontStack from '../lib/auto-update-waf-ipset-of-cloudfront-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new AutoUpdateWafIpSetOfCloudFrontStack.AutoUpdateWafIpSetOfCloudFrontStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
