 // joue la séquence une seule fois
      const seqClone = {
        startTimeSeq: geste.startTimeSeq,
        events: geste.events.map(e => ({ ...e }))
      };
      
      vptrSeq = new VirtualPointer(app, eventBoundary, pixiContainer);

      playgeste(seqClone, vptrSeq, () => {
        vptrSeq.up();
        vptrSeq.destroy();
        vptrSeq = null;
      });