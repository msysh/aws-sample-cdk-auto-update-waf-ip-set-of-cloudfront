import * as cdk from '@aws-cdk/core';
import * as sns from '@aws-cdk/aws-sns';
import * as lambda from '@aws-cdk/aws-lambda';

export interface IpRangeChangeSubscriptionProps {
	/**
	 * The visibility timeout to be configured on the SQS Queue, in seconds.
	 */
	idPrefix: string;

	lambdaFunction: lambda.Function
};

export class IpRangeChangeSubscription extends cdk.Construct {
	constructor(scope: cdk.Construct, id: string, props: IpRangeChangeSubscriptionProps){
		super(scope, id);

		const prefix = props.idPrefix;

		//
		// Sns
		//
		const topic = sns.Topic.fromTopicArn(this, `${prefix}ChangeIpRangeTopic`, 'arn:aws:sns:us-east-1:806199016981:AmazonIpSpaceChanged');

		const subscription = new sns.Subscription(this, `${prefix}ChangeIpRangeSubscription`, {
			endpoint: props.lambdaFunction.functionArn,
			protocol: sns.SubscriptionProtocol.LAMBDA,
			topic: topic,
			region: 'us-east-1'
		});
	}
}