# Synthetic profiler reproduction

Run from repository root. The temporary baseline shares the current common UI;
this is a controlled screen-mount vs warmed-focus measurement, not a native
benchmark. Keep fixtures out of the commit.

```sh
git show 75a32534e7cd1db7e46374d9a0a98881167df3ee:app/src/features/trainer-clients/trainer-clients-screen.tsx > app/src/features/trainer-clients/som39-baseline.tsx
```

Create `app/tests/som39-measure.test.tsx` with the following fixture, then run
`cd app && npx jest tests/som39-measure.test.tsx --runInBand`.
Remove both temporary files afterwards.

```tsx
import { act, render } from '@testing-library/react-native';
import { Profiler } from 'react';
import { NavigationContext } from 'expo-router/react-navigation';
import '../src/lib/i18n';
import { TrainerClientsScreen as Baseline } from '../src/features/trainer-clients/som39-baseline';
import { TrainerClientsScreen } from '../src/features/trainer-clients/trainer-clients-screen';
import { MotionPolicyProvider } from '../src/ui/motion';
jest.mock('expo-router', () => ({router:{push:jest.fn()}}));
jest.mock('react-native-safe-area-context', () => {const {View}=jest.requireActual<typeof import('react-native')>('react-native');return {SafeAreaView:View};});
test('record isolated mount versus preloaded focus CPU cost', async () => {
 const baseline:number[]=[];
 for(let i=0;i<11;i++){let cpu=0;const view=await render(<Profiler id="baseline" onRender={(_id,_phase,duration)=>{cpu+=duration;}}><Baseline/></Profiler>);if(i>0)baseline.push(cpu);await view.unmount();}
 console.log("SOM39_BASELINE",JSON.stringify(baseline));
 const samples: {mount:number;focus:number}[]=[];
 for(let i=0;i<11;i++){
  let focused=false;let cpu=0;const listeners=new Map<string,()=>void>();
  const navigation={isFocused:()=>focused,addListener:(event:string,callback:()=>void)=>{listeners.set(event,callback);return()=>listeners.delete(event);}} as unknown as React.ContextType<typeof NavigationContext>;
  const view=await render(<NavigationContext.Provider value={navigation}><MotionPolicyProvider><Profiler id="clients" onRender={(_id,_phase,duration)=>{cpu+=duration;}}><TrainerClientsScreen/></Profiler></MotionPolicyProvider></NavigationContext.Provider>);
  const mount=cpu;cpu=0; focused=true;
  await act(async()=>listeners.get('focus')?.());
  if(i>0)samples.push({mount,focus:cpu});
  await view.unmount();
 }
 console.log('SOM39_PROFILE',JSON.stringify(samples));
 expect(samples).toHaveLength(10);
});

```
