import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import { EventBridgeDestination } from '@aws-cdk/aws-lambda-destinations';

import { SlackNotification } from './slack-notification';
import { IpRangeChangeSubscription } from './ip-range-change-subscription';

export class AutoUpdateWafIpSetOfCloudFrontStack extends cdk.Stack {

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const slackWebHookUrl = this.node.tryGetContext('slackWebHookUrl');

    const {
      accountId,
      notificationArns,
      partition,
      region,
      stackId,
      stackName,
      urlSuffix,
    } = new cdk.ScopedAws(this);

    const prefix = id + '-';

    let slackNotification = undefined;
    if (slackWebHookUrl){
      slackNotification = new SlackNotification(this, `${prefix}SlackNotification`, {
        idPrefix: prefix,
        slackWebHookUrl: slackWebHookUrl
      });
    }

    //
    // IAM Policy & Role for Lambda
    //
    const policyStatement1 = new iam.PolicyStatement({ effect: iam.Effect.ALLOW });
    policyStatement1.addActions(
      'logs:CreateLogGroup'
    );
    policyStatement1.addResources(
      `arn:aws:logs:${this.region}:${this.account}:*`
    );

    const policyStatement2 = new iam.PolicyStatement({ effect: iam.Effect.ALLOW });
    policyStatement2.addActions(
      'logs:CreateLogStream',
      'logs:PutLogEvents'
    );
    policyStatement2.addResources(
      `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/${prefix}Lambda:*`
    );

    const policyStatement3 = new iam.PolicyStatement({ effect: iam.Effect.ALLOW });
    policyStatement3.addActions(
      'wafv2:GetIPSet',
      'wafv2:CreateIPSet',
      'wafv2:UpdateIPSet'
    );
    policyStatement3.addResources(
      `arn:aws:wafv2:${this.region}:${this.account}:*/ipset/${prefix}*/*`
    );

    const policyStatement4 = new iam.PolicyStatement({ effect: iam.Effect.ALLOW });
    policyStatement4.addActions(
      'wafv2:ListIPSets'
    );
    policyStatement4.addResources(
      `arn:aws:wafv2:${this.region}:${this.account}:*`
    );

    /*
    // For X-Ray tracing
    const policyStatement5 = new iam.PolicyStatement({ effect: iam.Effect.ALLOW });
    policyStatement5.addActions(
      'events:PutEvents'
    );
    policyStatement5.addResources(
      `arn:aws:events:${this.region}:${this.account}:event-bus/${prefix}EventBus`
    );

    const policyStatement6 = new iam.PolicyStatement({ effect: iam.Effect.ALLOW });
    policyStatement6.addActions(
      'xray:PutTraceSegments',
      'xray:PutTelemetryRecords'
    );
    policyStatement6.addResources('*');
    */

    const policyDocument = new iam.PolicyDocument({
      statements:[
        policyStatement1,
        policyStatement2,
        policyStatement3,
        policyStatement4,
        // policyStatement5,
        // policyStatement6
      ]})

    const role = new iam.Role(this, `${prefix}Role`, {
      roleName: `${prefix}Role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Role for Lambda by CDK',
      //managedPolicies: [
      //  iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      //],
      inlinePolicies: {
        'policy': policyDocument
      }
    });

    //
    // Lambda
    //
    let lambdaProps: lambda.FunctionProps;
    if (slackWebHookUrl){
      lambdaProps = {
        functionName: `${prefix}Lambda`,
        runtime: lambda.Runtime.NODEJS_14_X,
        code: lambda.AssetCode.fromAsset('lambda'),
        handler: 'app.lambdaHandler',
        timeout: cdk.Duration.seconds(60),
        role: role,
        environment: {
          //KEY: "VALUE"
          NAME_PREFIX: prefix
        },
        onSuccess: new EventBridgeDestination(slackNotification?.eventBus),
        // tracing: lambda.Tracing.ACTIVE
      };
    }
    else{
      lambdaProps = {
        functionName: `${prefix}Lambda`,
        runtime: lambda.Runtime.NODEJS_14_X,
        code: lambda.AssetCode.fromAsset('lambda'),
        handler: 'app.lambdaHandler',
        timeout: cdk.Duration.seconds(60),
        role: role,
        environment: {
          //KEY: "VALUE"
          NAME_PREFIX: prefix
        },
        // tracing: lambda.Tracing.ACTIVE
      };
    }
    const lambdaFunction = new lambda.Function(this, `${prefix}Lambda`, lambdaProps);

    const ipRangeChangeSubscription = new IpRangeChangeSubscription(this, `${prefix}IpRangeChangeNotification`, {
      idPrefix: prefix,
      lambdaFunction: lambdaFunction
    });
  }
}
