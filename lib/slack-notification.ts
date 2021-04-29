import * as cdk from '@aws-cdk/core';
import * as event from '@aws-cdk/aws-events';
import * as iam from '@aws-cdk/aws-iam';

export interface SlackNotificationProps {
	/**
	 * The visibility timeout to be configured on the SQS Queue, in seconds.
	 */
	idPrefix: string;

	/**
	 * Slack web hook url.
	 */
	slackWebHookUrl: string;
}

export class SlackNotification extends cdk.Construct {

	public readonly eventBus: event.EventBus;

	constructor(scope: cdk.Construct, id: string, props: SlackNotificationProps){
		super(scope, id);

		const {
			accountId,
			notificationArns,
			partition,
			region,
			stackId,
			stackName,
			urlSuffix,
		} = new cdk.ScopedAws(this);

		const prefix = props.idPrefix;

		this.eventBus = new event.EventBus(this, `${prefix}EventBus`, {
			eventBusName: `${prefix}EventBus`
		});

		const connection = new event.CfnConnection(this, `${prefix}EventBridge-Connection`, {
			authParameters: {
				ApiKeyAuthParameters: {
				ApiKeyName: 'dummy-header',
				ApiKeyValue: 'dummy-header-value'
				}
			},
			authorizationType: 'API_KEY',
			description: 'Slack',
			name: `${prefix}Slack`
		});

		const apiDestination = new event.CfnApiDestination(this, `${prefix}EventBridge-ApiDestination`, {
			connectionArn: connection.attrArn,
			description: 'API destination of Slack',
			httpMethod: 'POST',
			invocationEndpoint: props.slackWebHookUrl,
			invocationRateLimitPerSecond: 1,
			name: `${prefix}SlackApiDestination`
		});

		//
		// IAM Policy & Role for EventBridge
		//
		const policyStatementForEventBridge = new iam.PolicyStatement({ effect: iam.Effect.ALLOW });
		policyStatementForEventBridge.addActions(
			'events:InvokeApiDestination'
		);
		policyStatementForEventBridge.addResources(
			`arn:aws:events:${region}:${accountId}:api-destination/${prefix}SlackApiDestination/*`
		);
		const policyDocumentForEventBridge = new iam.PolicyDocument({statements:[policyStatementForEventBridge]})
		const roleForEventBridge = new iam.Role(this, `${prefix}EventBridge-Role`, {
			roleName: `${prefix}EventBridge-Role`,
			assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
			description: 'Role for EventBridge invoke API destination by CDK',
			inlinePolicies: {
				'policy': policyDocumentForEventBridge
			}
		});

		const rule = new event.CfnRule(this, `${prefix}EventBridge-Rule`, {
			description: 'Rule for slack notification',
			eventBusName: this.eventBus.eventBusName,
			eventPattern: {
				detail: {
					responsePayload: {
						source: [ `${prefix}Lambda` ]
					}
				}
			},
			name: `${prefix}EventBridge-Rule`,
			state: 'ENABLED',
			targets: [
				{
					arn: apiDestination.attrArn,
					id: 'target-1',
					inputTransformer: {
						inputTemplate: JSON.stringify({
							attachments: [
								{
									fallback: "<title>",
									pretext: "<title>",
									color: "<color>",
									fields: [
										{
											title: "<title>",
											value: "<message>"
										}
									],
									footer: "by Amazon EventBridge - API Destination"
								}
							]
						}),
						inputPathsMap: {
							statusCode: "$.detail.responsePayload.statusCode",
							color: "$.detail.responsePayload.color",
							changedAt: "$.detail.responsePayload.changedAt",
							title: "$.detail.responsePayload.title",
							message: "$.detail.responsePayload.message"
						}
					},
					roleArn: roleForEventBridge.roleArn
				}
			]
		});
	}
}