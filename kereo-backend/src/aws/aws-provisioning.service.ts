import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  DeleteServiceCommand,
  DeregisterTaskDefinitionCommand,
  DescribeServicesCommand,
  ECSClient,
  ListTaskDefinitionsCommand,
  waitUntilServicesInactive,
} from '@aws-sdk/client-ecs';
import {
  CreateRuleCommand,
  CreateTargetGroupCommand,
  DeleteRuleCommand,
  DeleteTargetGroupCommand,
  ElasticLoadBalancingV2Client,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import {
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';

type ProvisionProjectInput = {
  slug: string;
  port: number;
  healthCheckPath: string;
};

type ProvisionProjectResult = {
  targetGroupArn: string;
  listenerRuleArn: string;
  ecsSecurityGroupId: string;
  publicUrl: string;
};

type DeleteProjectResourcesInput = {
  ecsServiceName?: string | null;
  ecsTaskFamily?: string | null;
  targetGroupArn?: string | null;
  listenerRuleArn?: string | null;
  ecsSecurityGroupId?: string | null;
};

@Injectable()
export class AwsProvisioningService implements OnModuleInit {
  private readonly logger = new Logger(AwsProvisioningService.name);

  onModuleInit() {
    const albListenerArn = process.env.ALB_LISTENER_ARN;
    const publicBaseUrl = this.getPublicBaseUrl();

    if (albListenerArn) {
      this.logger.log(`Using ALB listener ARN: ${albListenerArn}`);
    }

    this.logger.log(`Using public base URL: ${publicBaseUrl}`);
  }

  async provisionProject(
    input: ProvisionProjectInput,
  ): Promise<ProvisionProjectResult> {
    const awsRegion = process.env.AWS_REGION;
    const vpcId = process.env.VPC_ID;
    const albListenerArn = process.env.ALB_LISTENER_ARN;
    const albSecurityGroupId = process.env.ALB_SECURITY_GROUP_ID;
    const publicBaseUrl = this.getPublicBaseUrl();
    const albDnsNameFallback = process.env.PUBLIC_BASE_URL
      ? 'configured'
      : process.env.ALB_DNS_NAME;

    const missingVariables = [
      ['AWS_REGION', awsRegion],
      ['VPC_ID', vpcId],
      ['ALB_LISTENER_ARN', albListenerArn],
      ['ALB_SECURITY_GROUP_ID', albSecurityGroupId],
      ['ALB_DNS_NAME', albDnsNameFallback],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missingVariables.length > 0) {
      throw new Error(
        `Missing AWS provisioning environment variables: ${missingVariables.join(', ')}`,
      );
    }

    const client = new ElasticLoadBalancingV2Client({
      region: awsRegion,
    });
    const ec2Client = new EC2Client({
      region: awsRegion,
    });

    const targetGroupName = this.buildTargetGroupName(input.slug);
    let targetGroupArn: string | undefined;
    let listenerRuleArn: string | undefined;
    let ecsSecurityGroupId: string | undefined;

    try {
      ecsSecurityGroupId = await this.createProjectSecurityGroup(ec2Client, {
        projectSlug: input.slug,
        vpcId: vpcId as string,
        albSecurityGroupId: albSecurityGroupId as string,
        port: input.port,
      });

      this.logger.log(`Creating target group ${targetGroupName}`);

      const targetGroupResult = await client.send(
        new CreateTargetGroupCommand({
          Name: targetGroupName,
          Protocol: 'HTTP',
          Port: input.port,
          TargetType: 'ip',
          VpcId: vpcId,
          HealthCheckPath: input.healthCheckPath,
          HealthCheckProtocol: 'HTTP',
          Matcher: {
            HttpCode: '200',
          },
        }),
      );

      targetGroupArn = targetGroupResult.TargetGroups?.[0]?.TargetGroupArn;

      if (!targetGroupArn) {
        throw new Error('AWS did not return a target group ARN');
      }

      listenerRuleArn = await this.createListenerRuleWithRetry(client, {
        listenerArn: albListenerArn as string,
        slug: input.slug,
        targetGroupArn,
        publicBaseUrl,
      });

      const publicUrl = this.buildProjectPublicUrl(publicBaseUrl, input.slug);

      this.logger.log(`Public URL for project: ${publicUrl}`);

      if (!ecsSecurityGroupId) {
        throw new Error('AWS did not return a project ECS security group id');
      }

      return {
        targetGroupArn,
        listenerRuleArn,
        ecsSecurityGroupId,
        publicUrl,
      };
    } catch (error) {
      this.logger.error(
        `AWS project provisioning failed for slug ${input.slug}`,
        error instanceof Error ? error.stack : String(error),
      );

      await this.rollbackProvisioning(client, {
        listenerRuleArn,
        targetGroupArn,
      });
      await this.deleteSecurityGroup(ec2Client, ecsSecurityGroupId);

      throw error;
    }
  }

  async deleteProjectResources(input: DeleteProjectResourcesInput) {
    const awsRegion = process.env.AWS_REGION;
    const ecsClusterName = process.env.ECS_CLUSTER_NAME;

    if (!awsRegion) {
      throw new Error('Missing AWS_REGION environment variable');
    }

    const ecsClient = new ECSClient({ region: awsRegion });
    const elbClient = new ElasticLoadBalancingV2Client({ region: awsRegion });
    const ec2Client = new EC2Client({ region: awsRegion });

    if (input.ecsServiceName) {
      if (!ecsClusterName) {
        throw new Error('Missing ECS_CLUSTER_NAME environment variable');
      }

      await this.deleteEcsService(ecsClient, {
        cluster: ecsClusterName,
        serviceName: input.ecsServiceName,
      });
    }

    if (input.ecsTaskFamily) {
      await this.deregisterTaskDefinitions(ecsClient, input.ecsTaskFamily);
    }

    if (input.listenerRuleArn) {
      await this.deleteListenerRule(elbClient, input.listenerRuleArn);
    }

    if (input.targetGroupArn) {
      await this.deleteTargetGroup(elbClient, input.targetGroupArn);
    }

    if (input.ecsSecurityGroupId) {
      await this.deleteSecurityGroup(ec2Client, input.ecsSecurityGroupId);
    }
  }

  private async createListenerRuleWithRetry(
    client: ElasticLoadBalancingV2Client,
    input: {
      listenerArn: string;
      slug: string;
      targetGroupArn: string;
      publicBaseUrl: string;
    },
  ) {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const priority = this.generateListenerRulePriority();
      const projectHost = this.buildProjectHostname(
        input.publicBaseUrl,
        input.slug,
      );

      this.logger.log(
        `Creating listener rule on listener: ${input.listenerArn}`,
      );
      this.logger.log(
        `Creating listener rule for host ${projectHost} with priority ${priority}`,
      );

      try {
        const listenerRuleResult = await client.send(
          new CreateRuleCommand({
            ListenerArn: input.listenerArn,
            Priority: priority,
            Conditions: [
              {
                Field: 'host-header',
                HostHeaderConfig: {
                  Values: [projectHost],
                },
              },
            ],
            Actions: [
              {
                Type: 'forward',
                TargetGroupArn: input.targetGroupArn,
              },
            ],
          }),
        );

        const listenerRuleArn = listenerRuleResult.Rules?.[0]?.RuleArn;

        if (!listenerRuleArn) {
          throw new Error('AWS did not return a listener rule ARN');
        }

        return listenerRuleArn;
      } catch (error) {
        const errorName =
          error instanceof Error && 'name' in error ? error.name : '';

        if (errorName !== 'PriorityInUseException' || attempt === 5) {
          throw error;
        }

        this.logger.warn(`Listener priority ${priority} is in use, retrying`);
      }
    }

    throw new Error('Failed to create listener rule');
  }

  private buildTargetGroupName(slug: string) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const prefix = `kereo-${slug}`
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 25)
      .replace(/-+$/g, '');

    return `${prefix}-${suffix}`.slice(0, 32).replace(/-+$/g, '');
  }

  private buildProjectPublicUrl(publicBaseUrl: string, slug: string) {
    const url = new URL(publicBaseUrl);
    url.hostname = this.buildProjectHostname(publicBaseUrl, slug);
    url.pathname = '/';
    url.search = '';
    url.hash = '';

    return url.toString().replace(/\/$/, '');
  }

  private buildProjectHostname(publicBaseUrl: string, slug: string) {
    const url = new URL(publicBaseUrl);
    return `${slug}.${url.hostname}`;
  }

  private async createProjectSecurityGroup(
    ec2Client: EC2Client,
    input: {
      projectSlug: string;
      vpcId: string;
      albSecurityGroupId: string;
      port: number;
    },
  ) {
    const groupName = this.buildProjectSecurityGroupName(input.projectSlug);
    this.logger.log(`Creating project security group ${groupName}`);

    const securityGroupResult = await ec2Client.send(
      new CreateSecurityGroupCommand({
        GroupName: groupName,
        Description: `Kereo project task access for ${input.projectSlug}`,
        VpcId: input.vpcId,
        TagSpecifications: [
          {
            ResourceType: 'security-group',
            Tags: [
              {
                Key: 'Name',
                Value: groupName,
              },
              {
                Key: 'Project',
                Value: input.projectSlug,
              },
            ],
          },
        ],
      }),
    );

    const securityGroupId = securityGroupResult.GroupId;

    if (!securityGroupId) {
      throw new Error('AWS did not return a project security group id');
    }

    await ec2Client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpPermissions: [
          {
            IpProtocol: 'tcp',
            FromPort: input.port,
            ToPort: input.port,
            UserIdGroupPairs: [
              {
                GroupId: input.albSecurityGroupId,
              },
            ],
          },
        ],
      }),
    );

    return securityGroupId;
  }

  private buildProjectSecurityGroupName(slug: string) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const prefix = `kereo-${slug}-tasks`
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20)
      .replace(/-+$/g, '');

    return `${prefix}-${suffix}`.slice(0, 255).replace(/-+$/g, '');
  }

  private generateListenerRulePriority() {
    return Math.floor(Math.random() * (50000 - 100 + 1)) + 100;
  }

  private getPublicBaseUrl() {
    const publicBaseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/+$/g, '');

    if (publicBaseUrl) {
      return publicBaseUrl;
    }

    const albDnsName = process.env.ALB_DNS_NAME;

    if (!albDnsName) {
      throw new Error('Missing ALB_DNS_NAME environment variable');
    }

    return `http://${albDnsName}`;
  }

  private async deleteEcsService(
    client: ECSClient,
    input: {
      cluster: string;
      serviceName: string;
    },
  ) {
    try {
      const serviceDetails = await client.send(
        new DescribeServicesCommand({
          cluster: input.cluster,
          services: [input.serviceName],
        }),
      );

      const service = serviceDetails.services?.[0];

      if (!service || service.status === 'INACTIVE') {
        this.logger.log(`ECS service already absent: ${input.serviceName}`);
        return;
      }

      this.logger.log(`Deleting ECS service ${input.serviceName}`);

      await client.send(
        new DeleteServiceCommand({
          cluster: input.cluster,
          service: input.serviceName,
          force: true,
        }),
      );

      await waitUntilServicesInactive(
        {
          client,
          maxWaitTime: 120,
          minDelay: 5,
          maxDelay: 15,
        },
        {
          cluster: input.cluster,
          services: [input.serviceName],
        },
      );
    } catch (error) {
      if (this.isAwsNotFoundError(error)) {
        this.logger.log(`ECS service already deleted: ${input.serviceName}`);
        return;
      }

      if (this.isAwsWaiterTimeoutError(error)) {
        const latestServiceStatus = await this.getEcsServiceStatus(client, {
          cluster: input.cluster,
          serviceName: input.serviceName,
        });

        if (!latestServiceStatus || latestServiceStatus === 'INACTIVE') {
          this.logger.log(`ECS service is inactive: ${input.serviceName}`);
          return;
        }

        if (latestServiceStatus === 'DRAINING') {
          this.logger.warn(
            `ECS service ${input.serviceName} is still draining; continuing cleanup`,
          );
          return;
        }
      }

      throw error;
    }
  }

  private async getEcsServiceStatus(
    client: ECSClient,
    input: {
      cluster: string;
      serviceName: string;
    },
  ) {
    try {
      const serviceDetails = await client.send(
        new DescribeServicesCommand({
          cluster: input.cluster,
          services: [input.serviceName],
        }),
      );

      return serviceDetails.services?.[0]?.status;
    } catch (error) {
      if (this.isAwsNotFoundError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  private async deregisterTaskDefinitions(client: ECSClient, family: string) {
    let nextToken: string | undefined;

    do {
      const taskDefinitions = await client.send(
        new ListTaskDefinitionsCommand({
          familyPrefix: family,
          status: 'ACTIVE',
          nextToken,
        }),
      );

      for (const taskDefinitionArn of taskDefinitions.taskDefinitionArns ??
        []) {
        this.logger.log(`Deregistering task definition ${taskDefinitionArn}`);

        await client.send(
          new DeregisterTaskDefinitionCommand({
            taskDefinition: taskDefinitionArn,
          }),
        );
      }

      nextToken = taskDefinitions.nextToken;
    } while (nextToken);
  }

  private async deleteListenerRule(
    client: ElasticLoadBalancingV2Client,
    ruleArn: string,
  ) {
    try {
      this.logger.log(`Deleting listener rule ${ruleArn}`);

      await client.send(
        new DeleteRuleCommand({
          RuleArn: ruleArn,
        }),
      );
    } catch (error) {
      if (this.isAwsNotFoundError(error)) {
        this.logger.log(`Listener rule already deleted: ${ruleArn}`);
        return;
      }

      throw error;
    }
  }

  private async deleteTargetGroup(
    client: ElasticLoadBalancingV2Client,
    targetGroupArn: string,
  ) {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      try {
        this.logger.log(`Deleting target group ${targetGroupArn}`);

        await client.send(
          new DeleteTargetGroupCommand({
            TargetGroupArn: targetGroupArn,
          }),
        );

        return;
      } catch (error) {
        if (this.isAwsNotFoundError(error)) {
          this.logger.log(`Target group already deleted: ${targetGroupArn}`);
          return;
        }

        if (this.isAwsResourceInUseError(error) && attempt < 10) {
          this.logger.warn(
            `Target group ${targetGroupArn} is still in use; retrying delete (${attempt}/10)`,
          );

          await this.sleep(10000);
          continue;
        }

        throw error;
      }
    }
  }

  private async deleteSecurityGroup(
    ec2Client: EC2Client,
    securityGroupId?: string | null,
  ) {
    if (!securityGroupId) {
      return;
    }

    try {
      await ec2Client.send(
        new DeleteSecurityGroupCommand({
          GroupId: securityGroupId,
        }),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        'name' in error &&
        (error.name === 'InvalidGroup.NotFound' ||
          error.name === 'DependencyViolation')
      ) {
        return;
      }

      throw error;
    }
  }

  private isAwsNotFoundError(error: unknown) {
    return (
      error instanceof Error &&
      [
        'ServiceNotFoundException',
        'RuleNotFoundException',
        'TargetGroupNotFoundException',
      ].includes(error.name)
    );
  }

  private isAwsWaiterTimeoutError(error: unknown) {
    return error instanceof Error && error.name === 'TimeoutError';
  }

  private isAwsResourceInUseError(error: unknown) {
    return error instanceof Error && error.name === 'ResourceInUseException';
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async rollbackProvisioning(
    client: ElasticLoadBalancingV2Client,
    resources: {
      listenerRuleArn?: string;
      targetGroupArn?: string;
    },
  ) {
    if (resources.listenerRuleArn) {
      try {
        await client.send(
          new DeleteRuleCommand({
            RuleArn: resources.listenerRuleArn,
          }),
        );
      } catch (error) {
        this.logger.warn(
          `Failed to rollback listener rule ${resources.listenerRuleArn}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (resources.targetGroupArn) {
      try {
        await client.send(
          new DeleteTargetGroupCommand({
            TargetGroupArn: resources.targetGroupArn,
          }),
        );
      } catch (error) {
        this.logger.warn(
          `Failed to rollback target group ${resources.targetGroupArn}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
