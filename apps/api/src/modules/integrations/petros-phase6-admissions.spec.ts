import {describe,expect,it} from 'vitest';
import {schema} from '@edrion/database';
import {PetrosReleaseRepository} from '../petros-quality/petros-release.repository';
import {releaseDigest} from '../petros-quality/petros-release.service';
import {loadApiEnv} from '@edrion/config';

describe('Phase 6 feature admission defaults',()=>{
  it('keeps new capabilities and real-pilot collection off in an otherwise valid environment',()=>{
    const env=loadApiEnv({NODE_ENV:'test',DATABASE_URL:'postgres://synthetic:synthetic@127.0.0.1:9/synthetic',
      REDIS_URL:'redis://127.0.0.1:9',SESSION_COOKIE_SECRET:'synthetic-phase6-default-test'});
    expect(env.PETROS_MULTI_SOURCE_ENABLED).toBe(false);
    expect(env.PETROS_TEACHER_AUTHORING_ENABLED).toBe(false);
    expect(env.PETROS_ADVANCED_MODELS_ENABLED).toBe(false);
    expect(env.PETROS_ASSIGNMENT_LEARNING_ENABLED).toBe(false);
    expect(env.PETROS_CONTINUITY_ENABLED).toBe(false);
    expect(env.PETROS_PILOT_SYNTHETIC_INSTRUMENTATION_ENABLED).toBe(false);
  });
  it('binds each new admission switch to the real release configuration digest',async()=>{
    const env=loadApiEnv({NODE_ENV:'test',DATABASE_URL:'postgres://synthetic:synthetic@127.0.0.1:9/synthetic',REDIS_URL:'redis://127.0.0.1:9',SESSION_COOKIE_SECRET:'synthetic-phase6-default-test'});
    const functionId='11111111-1111-4111-8111-111111111111';
    const db={select:()=>({from:(table:unknown)=>{
      const rows=table===schema.petrosAiFunctions?[{id:functionId,key:'synthetic-config',enabled:true,allowedInputTypes:[],responseFormat:'json',requiredCapabilities:[],settings:{}}]:[];
      const query={where:()=>query,limit:()=>query,for:async()=>rows};return query;
    }})};
    const repo=new PetrosReleaseRepository(db as never,env);
    const baseline=releaseDigest(await repo.configuration(functionId));
    for(const key of ['PETROS_MULTI_SOURCE_ENABLED','PETROS_TEACHER_AUTHORING_ENABLED','PETROS_ADVANCED_MODELS_ENABLED'] as const){
      env[key]=true;
      expect(releaseDigest(await repo.configuration(functionId))).not.toEqual(baseline);
      env[key]=false;
      expect(releaseDigest(await repo.configuration(functionId))).toEqual(baseline);
    }
  });
});
