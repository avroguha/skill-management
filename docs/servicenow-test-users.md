# ServiceNow test users

A small hierarchy for trying the directory sync on a personal developer instance.
Every login name starts with `skm.`, so the set is easy to find and remove
(`sys_user` list, filter *User ID starts with skm.*).

| user_name | Name | Title | Manager | identity_type |
|---|---|---|---|---|
| skm.cto | Ava Sharma | Chief Technology Officer | | human |
| skm.vp.platform | Liam Carter | VP Platform Engineering | skm.cto | human |
| skm.vp.ops | Grace Kim | VP Operations | skm.cto | human |
| skm.mgr.cloud | Priya Nair | Cloud Engineering Manager | skm.vp.platform | human |
| skm.mgr.data | Ethan Brooks | Data Engineering Manager | skm.vp.platform | human |
| skm.mgr.service | Rohan Mehta | Service Desk Manager | skm.vp.ops | human |
| skm.eng.noah / mia / arjun | Noah Patel, Mia Chen, Arjun Rao | Cloud Engineers | skm.mgr.cloud | human |
| skm.eng.ivy | Ivy Lopez | Cloud Engineer | skm.mgr.cloud | unclassified |
| skm.data.isha / lucas | Isha Gupta, Lucas Meyer | Data Engineers | skm.mgr.data | human |
| skm.desk.zara / oliver / neha | Zara Ali, Oliver Scott, Neha Iyer | Service Analysts | skm.mgr.service | human |
| skm.desk.sam | Sam Turner | Service Analyst | skm.mgr.service | unclassified |
| skm.svc.monitor | Monitoring Service | Service account | skm.mgr.cloud | machine |
| skm.svc.integration | Integration Account | Service account | skm.cto | machine |

With the top-level user `skm.cto` and *User type* `identity_type` = `human`, a sync brings
in 14 people and leaves 4 out; with `human` and `unclassified`, 16; with no filter, all 18.
E-mail addresses are `first.last@skm-test.avro.com`.
