// The starter skill catalogue: loaded into an empty live database on the first start, and
// offered for download in Settings › Skills (edit it, upload it back: an upload updates what
// exists and adds what is new). Generic on purpose: a site's own catalogue replaces or extends it.
// Columns as every skills CSV: category, skill, sub_skill, aliases (separated by ;), description, status.
export const STARTER_SKILLS_CSV = `category,skill,sub_skill,aliases,description,status
Cloud & Containers,AWS,,Amazon Web Services,"Designing, deploying and operating systems on Amazon Web Services.",active
Cloud & Containers,AWS,EC2 and networking,VPC,"Instances, VPCs, subnets, security groups, load balancers.",active
Cloud & Containers,AWS,IAM,,"Users, roles, policies and least-privilege access.",active
Cloud & Containers,AWS,Storage (S3 and EBS),S3,"Object and block storage, lifecycle and encryption.",active
Cloud & Containers,AWS,Serverless (Lambda),Lambda,"Functions, event sources, API Gateway.",active
Cloud & Containers,Microsoft Azure,,Azure,"Designing, deploying and operating systems on Microsoft Azure.",active
Cloud & Containers,Microsoft Azure,Virtual machines and networking,VNet,"VMs, virtual networks, NSGs, load balancing.",active
Cloud & Containers,Microsoft Azure,Entra ID,Azure AD,"Identities, app registrations, conditional access.",active
Cloud & Containers,Microsoft Azure,AKS,,"Azure Kubernetes Service.",active
Cloud & Containers,Google Cloud,,GCP,"Designing, deploying and operating systems on Google Cloud.",active
Cloud & Containers,Kubernetes,,K8s; kube,"Deploying, scaling and troubleshooting workloads on Kubernetes.",active
Cloud & Containers,Docker and containers,,Docker; Podman,"Building images, running and debugging containers.",active
Cloud & Containers,Infrastructure as code,,IaC,"Defining infrastructure in code.",active
Cloud & Containers,Infrastructure as code,Terraform,,"Modules, state, plans and providers.",active
Cloud & Containers,Infrastructure as code,Ansible,,"Playbooks, roles and inventories.",active
Cloud & Containers,Cloud cost management,,FinOps,"Understanding and reducing cloud spend.",active
Software Engineering,Python,,,"Writing, testing and packaging Python.",active
Software Engineering,Java,,,"Writing and maintaining Java services.",active
Software Engineering,JavaScript and TypeScript,,JS; TS; Node.js,"Front-end and Node.js code in JavaScript or TypeScript.",active
Software Engineering,C# and .NET,,.NET,"Applications and services on .NET.",active
Software Engineering,Go,,Golang,"Services and tools in Go.",active
Software Engineering,Shell scripting,,Bash; PowerShell,"Automating tasks with Bash or PowerShell.",active
Software Engineering,SQL,,,"Writing and tuning queries.",active
Software Engineering,API design,,REST; GraphQL,"Designing, documenting and versioning APIs.",active
Software Engineering,Web front end,,React; HTML; CSS,"Building accessible, responsive user interfaces.",active
Software Engineering,Automated testing,,Unit tests; test automation,"Unit, integration and end-to-end tests.",active
Software Engineering,Software architecture,,System design,"Designing systems that are simple, scalable and maintainable.",active
Software Engineering,Code review,,,"Reviewing changes for correctness, clarity and risk.",active
DevOps & Delivery,Git and version control,,Git; GitHub; GitLab,"Branching, merging and working in a shared repository.",active
DevOps & Delivery,CI/CD pipelines,,Jenkins; GitHub Actions; Azure DevOps,"Building, testing and deploying automatically.",active
DevOps & Delivery,Release management,,,"Planning and coordinating releases.",active
DevOps & Delivery,Configuration management,,,"Keeping systems consistent and drift-free.",active
DevOps & Delivery,Site reliability engineering,,SRE,"SLOs, error budgets, toil reduction.",active
Data & Analytics,Data modelling,,,"Designing schemas and data models.",active
Data & Analytics,Data engineering,,ETL; ELT,"Building reliable data pipelines.",active
Data & Analytics,Data engineering,Apache Spark,Spark,"Distributed data processing.",active
Data & Analytics,Data engineering,Kafka and streaming,Kafka,"Event streaming and real-time pipelines.",active
Data & Analytics,Reporting and dashboards,,Power BI; Tableau,"Turning data into reports people use.",active
Data & Analytics,Data quality and governance,,,"Making data accurate, documented and controlled.",active
Data & Analytics,Statistics,,,"Choosing and interpreting the right analysis.",active
Databases,PostgreSQL,,Postgres,"Running and tuning PostgreSQL.",active
Databases,Microsoft SQL Server,,MSSQL,"Running and tuning SQL Server.",active
Databases,Oracle Database,,Oracle,"Running and tuning Oracle databases.",active
Databases,NoSQL databases,,MongoDB; Cassandra; Redis,"Document, key-value and wide-column stores.",active
Databases,Database administration,,DBA,"Backups, recovery, replication and performance.",active
AI & Automation,Machine learning,,ML,"Training, evaluating and deploying models.",active
AI & Automation,Generative AI and LLMs,,GenAI; prompt engineering,"Using large language models safely and well.",active
AI & Automation,Process automation,,RPA,"Automating repetitive business and IT tasks.",active
AI & Automation,AIOps,,,"Using data and AI to run IT operations.",active
Security,Identity and access management,,IAM; SSO,"Authentication, authorisation, single sign-on.",active
Security,Network security,,Firewalls,"Firewalls, segmentation, secure remote access.",active
Security,Vulnerability management,,,"Finding, prioritising and fixing vulnerabilities.",active
Security,Security operations,,SOC; SIEM,"Detecting and responding to threats.",active
Security,Threat modelling,,,"Finding weaknesses in a design before they are built.",active
Security,Application security,,AppSec; OWASP,"Secure coding and testing applications.",active
Security,Cloud security,,,"Securing cloud accounts and workloads.",active
Security,Risk and compliance,,GRC; audit,"Controls, audits and regulatory requirements.",active
IT Service Management,Incident management,,Major incident,"Getting service back quickly and keeping people informed.",active
IT Service Management,Problem management,,RCA; root cause analysis,"Finding and removing the causes of incidents.",active
IT Service Management,Change management,,Change enablement,"Planning and approving changes with the right risk.",active
IT Service Management,Request fulfilment,,Service requests,"Handling standard requests quickly and consistently.",active
IT Service Management,Configuration management (CMDB),,CMDB,"Keeping an accurate record of services and their parts.",active
IT Service Management,Service level management,,SLA; SLO,"Agreeing and meeting service levels.",active
IT Service Management,Knowledge management,,,"Writing and keeping useful knowledge articles.",active
IT Service Management,ITSM platform administration,,,"Configuring and maintaining the service management tool.",active
IT Service Management,ITSM platform development,,,"Building workflows, integrations and apps on the service management tool.",active
Monitoring & Observability,Monitoring and alerting,,,"Knowing when something is wrong before users do.",active
Monitoring & Observability,Logging,,ELK; Splunk,"Collecting, searching and keeping logs.",active
Monitoring & Observability,Application performance monitoring,,APM; tracing,"Tracing and profiling applications.",active
Monitoring & Observability,Event management,,Event correlation,"Correlating and deduplicating events into actionable alerts.",active
Monitoring & Observability,Capacity planning,,,"Forecasting and providing the capacity services need.",active
Infrastructure & Operations,Linux administration,,Linux; RHEL; Ubuntu,"Running and troubleshooting Linux servers.",active
Infrastructure & Operations,Windows Server administration,,Windows Server; Active Directory,"Running and troubleshooting Windows servers.",active
Infrastructure & Operations,Virtualisation,,VMware; Hyper-V,"Running virtual machines and their hosts.",active
Infrastructure & Operations,Storage and backup,,SAN; NAS,"Storage systems, backup and restore.",active
Infrastructure & Operations,Batch and job scheduling,,Workload automation,"Scheduling and running batch workloads.",active
Infrastructure & Operations,Mainframe operations,,z/OS,"Running and supporting mainframe workloads.",active
Infrastructure & Operations,Disaster recovery and resilience,,DR; BCP,"Planning and testing recovery from failures.",active
Networking,Network fundamentals,,TCP/IP,"Routing, switching, addressing and troubleshooting.",active
Networking,DNS and DHCP,,,"Name resolution and address management.",active
Networking,Load balancing,,F5; NGINX,"Distributing traffic and keeping services available.",active
Networking,WAN and SD-WAN,,,"Connecting sites reliably.",active
Networking,Wireless networking,,Wi-Fi,"Designing and running wireless networks.",active
End-User Computing,Desktop and device support,,,"Supporting laptops, desktops and mobile devices.",active
End-User Computing,Device management,,Intune; MDM,"Managing and securing devices centrally.",active
End-User Computing,Collaboration tools,,Microsoft 365; Teams,"Running and supporting collaboration tools.",active
Ways of Working,Agile delivery,,Scrum; Kanban,"Delivering in small, frequent increments.",active
Ways of Working,Project management,,,"Planning and running projects to time and budget.",active
Ways of Working,Stakeholder management,,,"Understanding and working with the people affected.",active
Ways of Working,Communication,,Presenting,"Explaining clearly, in writing and in person.",active
Ways of Working,Technical writing,,Documentation,"Writing documentation people can follow.",active
Ways of Working,Mentoring and coaching,,,"Helping others grow.",active
Ways of Working,Problem solving,,,"Breaking down hard problems and finding the cause.",active
Ways of Working,Leadership,,People management,"Setting direction and growing a team.",active
Ways of Working,Vendor management,,,"Working with suppliers and contracts.",active
Ways of Working,Customer focus,,,"Understanding and serving the people who use the service.",active
`;
